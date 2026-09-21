const bcrypt = require('bcryptjs');
const { getDb } = require('../config/db');
const { now } = require('./mongo');

const permissionRows = [
  ['customers.view', 'customers', 'view'], ['customers.create', 'customers', 'create'], ['customers.edit', 'customers', 'edit'], ['customers.delete', 'customers', 'delete'],
  ['products.view', 'products', 'view'], ['products.create', 'products', 'create'], ['products.edit', 'products', 'edit'], ['products.delete', 'products', 'delete'],
  ['invoices.view', 'invoices', 'view'], ['invoices.create', 'invoices', 'create'], ['invoices.edit', 'invoices', 'edit'], ['invoices.delete', 'invoices', 'delete'], ['invoices.print', 'invoices', 'print'],
  ['reports.view', 'reports', 'view'], ['reports.export', 'reports', 'export'], ['users.manage', 'users', 'manage'], ['roles.manage', 'roles', 'manage'], ['settings.manage', 'settings', 'manage'], ['dashboard.view', 'dashboard', 'view'],
];

const roleRows = [
  [1, 'Admin', 'Full control of the system, users, roles and company settings', 1],
  [2, 'Accountant', 'Runs day-to-day invoicing and payments', 1],
  [3, 'Sales', 'Onboards customers, read-only on invoices', 1],
  [4, 'Viewer', 'Read-only oversight across all modules', 1],
];

const roleCodes = {
  1: permissionRows.map(([code]) => code),
  2: ['customers.view', 'customers.create', 'customers.edit', 'products.view', 'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.print', 'reports.view', 'reports.export', 'dashboard.view'],
  3: ['customers.view', 'customers.create', 'customers.edit', 'products.view', 'invoices.view', 'dashboard.view'],
  4: ['customers.view', 'products.view', 'invoices.view', 'reports.view', 'reports.export', 'dashboard.view'],
};

const products = [
  'GST', 'IMPORT DECLARATION', 'EXPORT DECLARATION', 'CANCELLATION',
  'CARGO CLEARANCE AND TRANSPORTATION', 'ITEM COST',
  'IMPORTER OF THE RECORD (USING CHOLA AS IMPORTER)', 'LICENSE (USING CHOLA LICENSE)',
];

async function seedDefaults(overrideUsername, overridePassword) {
  const db = getDb();
  if (!db) return;

  const permissions = db.collection('permissions');
  for (let index = 0; index < permissionRows.length; index += 1) {
    const [code, module, action] = permissionRows[index];
    await permissions.updateOne(
      { code },
      { $setOnInsert: { id: index + 1, code, module, action } },
      { upsert: true }
    );
  }

  for (const [id, name, description, is_system] of roleRows) {
    await db.collection('roles').updateOne(
      { id },
      { $setOnInsert: { id, name, description, is_system, created_at: now() } },
      { upsert: true }
    );
  }

  const permissionDocs = await permissions.find().toArray();
  const permissionIds = new Map(permissionDocs.map((p) => [p.code, p.id]));
  for (const [role_id, codes] of Object.entries(roleCodes)) {
    for (const code of codes) {
      const pId = permissionIds.get(code);
      if (pId) {
        await db.collection('role_permissions').updateOne(
          { _id: `${role_id}:${pId}` },
          { $set: { role_id: Number(role_id), permission_id: pId } },
          { upsert: true }
        );
      }
    }
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
          role_id: 1,
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
          role_id: 1,
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

  await db.collection('counters').updateOne(
    { _id: 'users' },
    { $max: { value: 1 } },
    { upsert: true }
  );
}

module.exports = { seedDefaults };
