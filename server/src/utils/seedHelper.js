const bcrypt = require('bcryptjs');
const { getDb } = require('../config/db');
const { now, syncCounter } = require('./mongo');
const { backfillGstOnly } = require('./gst');

const ADMIN_ROLE_ID = 1;

// [code, module, action]
const permissionRows = [
  ['customers.view', 'customers', 'view'], ['customers.create', 'customers', 'create'], ['customers.edit', 'customers', 'edit'], ['customers.delete', 'customers', 'delete'],
  ['products.view', 'products', 'view'], ['products.create', 'products', 'create'], ['products.edit', 'products', 'edit'], ['products.delete', 'products', 'delete'],
  ['invoices.view', 'invoices', 'view'], ['invoices.create', 'invoices', 'create'], ['invoices.edit', 'invoices', 'edit'], ['invoices.delete', 'invoices', 'delete'], ['invoices.print', 'invoices', 'print'],
  // GST-only scope: same actions, but confined to invoices that carry the GST line item.
  ['gst_invoices.view', 'gst_invoices', 'view'], ['gst_invoices.create', 'gst_invoices', 'create'], ['gst_invoices.edit', 'gst_invoices', 'edit'], ['gst_invoices.delete', 'gst_invoices', 'delete'], ['gst_invoices.print', 'gst_invoices', 'print'],
  ['reports.view', 'reports', 'view'], ['reports.export', 'reports', 'export'], ['users.manage', 'users', 'manage'], ['roles.manage', 'roles', 'manage'], ['settings.manage', 'settings', 'manage'], ['dashboard.view', 'dashboard', 'view'],
  ['quotations.view', 'quotations', 'view'], ['quotations.create', 'quotations', 'create'], ['quotations.edit', 'quotations', 'edit'], ['quotations.delete', 'quotations', 'delete'], ['quotations.print', 'quotations', 'print'],
];

// [id, name, description, is_system]
const roleRows = [
  [1, 'Admin', 'Full control of the system, users, roles and company settings', 1],
  [2, 'Accountant', 'Runs day-to-day invoicing and payments', 1],
  [3, 'Sales', 'Onboards customers, read-only on invoices', 1],
  [4, 'Viewer', 'Read-only oversight across all modules', 1],
  [5, 'Supervisor', 'GST invoices only: create, edit, delete and print GST bills, plus the dashboard', 1],
];

const roleCodes = {
  1: permissionRows.map(([code]) => code),
  2: ['customers.view', 'customers.create', 'customers.edit', 'products.view', 'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.print', 'quotations.view', 'quotations.create', 'quotations.edit', 'quotations.delete', 'quotations.print', 'reports.view', 'reports.export', 'dashboard.view'],
  3: ['customers.view', 'customers.create', 'customers.edit', 'products.view', 'invoices.view', 'quotations.view', 'quotations.create', 'dashboard.view'],
  4: ['customers.view', 'products.view', 'invoices.view', 'quotations.view', 'reports.view', 'reports.export', 'dashboard.view'],
  5: ['gst_invoices.view', 'gst_invoices.create', 'gst_invoices.edit', 'gst_invoices.delete', 'gst_invoices.print', 'dashboard.view'],
};

const products = [
  'GST', 'IMPORT DECLARATION', 'EXPORT DECLARATION', 'CANCELLATION',
  'CARGO CLEARANCE AND TRANSPORTATION', 'ITEM COST',
  'IMPORTER OF THE RECORD (USING CHOLA AS IMPORTER)', 'LICENSE (USING CHOLA LICENSE)',
];

// Collections whose ids come from nextId(); their counters must never lag behind
// rows that were seeded or migrated with explicit ids.
const COUNTER_COLLECTIONS = ['roles', 'users', 'products', 'customers', 'invoices', 'invoice_items', 'quotations'];

async function grantAll(db, roleId, codes, permissionIds) {
  for (const code of codes) {
    const pId = permissionIds.get(code);
    if (!pId) continue;
    await db.collection('role_permissions').updateOne(
      { _id: `${roleId}:${pId}` },
      { $set: { role_id: Number(roleId), permission_id: pId } },
      { upsert: true }
    );
  }
}

async function seedDefaults(overrideUsername, overridePassword) {
  const db = getDb();
  if (!db) return;

  const permissions = db.collection('permissions');
  for (let index = 0; index < permissionRows.length; index += 1) {
    const [code, module, action] = permissionRows[index];
    const existing = await permissions.findOne({ code });
    if (!existing) {
      const maxDoc = await permissions.find().sort({ id: -1 }).limit(1).toArray();
      const nextIdVal = maxDoc.length > 0 && maxDoc[0].id ? maxDoc[0].id + 1 : index + 1;
      await permissions.insertOne({ id: nextIdVal, code, module, action });
    }
  }

  const insertedRoleIds = new Set();
  for (const [id, name, description, is_system] of roleRows) {
    const result = await db.collection('roles').updateOne(
      { id },
      { $setOnInsert: { id, name, description, is_system, created_at: now() } },
      { upsert: true }
    );
    if (result.upsertedCount) insertedRoleIds.add(id);
  }

  const permissionDocs = await permissions.find().toArray();
  const permissionIds = new Map(permissionDocs.map((p) => [p.code, p.id]));

  for (const [roleIdText, codes] of Object.entries(roleCodes)) {
    const roleId = Number(roleIdText);
    if (roleId === ADMIN_ROLE_ID) {
      // Admin always holds every permission, including ones added in later releases.
      await grantAll(db, roleId, codes, permissionIds);
      continue;
    }
    // Other built-in roles get their defaults once. After that the matrix an admin
    // saves is the source of truth and must survive restarts.
    const alreadyConfigured = !insertedRoleIds.has(roleId)
      && (await db.collection('role_permissions').countDocuments({ role_id: roleId })) > 0;
    if (!alreadyConfigured) await grantAll(db, roleId, codes, permissionIds);
  }

  for (let index = 0; index < products.length; index += 1) {
    await db.collection('products').updateOne(
      { productname: products[index] },
      { $setOnInsert: { id: index + 1, productname: products[index], created_at: now() } },
      { upsert: true }
    );
  }

  await db.collection('company_settings').updateOne(
    { _id: 'company_settings' },
    {
      $set: {
        company_name: 'Chola Logistics Pte Ltd',
        address: 'Blk-640, Rowell Road, #01-54, Singapore 200640',
        tel: '+65 62917747',
        mobile: '+65 90144400',
        email: 'accounts@permitdeclaration.com.sg',
        website: 'www.permitdeclaration.com.sg',
        contact_no: '+65 96539713',
        uen: '201835067C',
        default_currency: 'SGD',
        updated_at: now(),
      },
      $setOnInsert: { id: 1, created_at: now() },
    },
    { upsert: true }
  );

  const adminUsername = (overrideUsername || process.env.ADMIN_USERNAME || 'admin').trim();
  const adminPassword = overridePassword || process.env.ADMIN_PASSWORD || 'admin';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const existingAdmin = await db.collection('users').findOne({
    username: { $regex: new RegExp(`^${adminUsername}$`, 'i') },
  });

  if (existingAdmin) {
    await db.collection('users').updateOne(
      { _id: existingAdmin._id },
      {
        $set: {
          password: hashedPassword,
          username: adminUsername,
          role_id: ADMIN_ROLE_ID,
          is_active: 1,
        },
      }
    );
  } else {
    await db.collection('users').updateOne(
      { username: adminUsername },
      {
        $set: {
          password: hashedPassword,
          username: adminUsername,
          role_id: ADMIN_ROLE_ID,
          is_active: 1,
          name: 'System Admin',
          email: 'admin@example.com',
          created_at: now(),
        },
        $setOnInsert: {
          id: 1,
        },
      },
      { upsert: true }
    );
  }

  // Seeded rows above bypass the id counters; bring every counter up to date so
  // "create" never collides with an existing id.
  for (const name of COUNTER_COLLECTIONS) {
    await syncCounter(name);
  }

  // Invoices saved before the GST-only flag existed get it now, so GST-only
  // accounts see exactly the invoices made up of GST lines and nothing else.
  await backfillGstOnly();
}

module.exports = { seedDefaults, permissionRows, roleRows, roleCodes };
