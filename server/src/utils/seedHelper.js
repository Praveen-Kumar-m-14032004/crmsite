const bcrypt = require('bcryptjs');
const { query, queryOne, execute, now } = require('./db');
const { backfillGstOnly } = require('./gst');

const ADMIN_ROLE_ID = 1;

// [code, module, action]
const permissionRows = [
  ['customers.view', 'customers', 'view'], ['customers.create', 'customers', 'create'], ['customers.edit', 'customers', 'edit'], ['customers.delete', 'customers', 'delete'],
  ['products.view', 'products', 'view'], ['products.create', 'products', 'create'], ['products.edit', 'products', 'edit'], ['products.delete', 'products', 'delete'],
  ['invoices.view', 'invoices', 'view'], ['invoices.create', 'invoices', 'create'], ['invoices.edit', 'invoices', 'edit'], ['invoices.delete', 'invoices', 'delete'], ['invoices.print', 'invoices', 'print'],
  // GST-only scope: same actions, but confined to invoices made up of GST lines only.
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

const defaultSettings = {
  company_name: 'Chola Logistics Pte Ltd',
  address: 'Blk-640, Rowell Road, #01-54, Singapore 200640',
  tel: '+65 62917747',
  mobile: '+65 90144400',
  email: 'accounts@permitdeclaration.com.sg',
  website: 'www.permitdeclaration.com.sg',
  contact_no: '+65 96539713',
  uen: '201835067C',
  default_currency: 'SGD',
};

async function grantAll(roleId, codes, permissionIds) {
  const pairs = codes.map((code) => permissionIds.get(code)).filter(Boolean).map((pId) => [roleId, pId]);
  if (pairs.length) await execute('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ?', [pairs]);
}

/**
 * Idempotent defaults: permissions, built-in roles, Admin's full grant, the
 * default products, company settings (only when none exist) and the admin user.
 * Safe to run on every start.
 */
async function seedDefaults(overrideUsername, overridePassword) {
  // Permissions: insert the ones that do not exist yet.
  await execute('INSERT IGNORE INTO permissions (code, module, action) VALUES ?', [permissionRows]);

  // Built-in roles keep fixed ids so the app can refer to them.
  const insertedRoleIds = new Set();
  for (const [id, name, description, is_system] of roleRows) {
    const existing = await queryOne('SELECT id FROM roles WHERE id = ? OR name = ?', [id, name]);
    if (existing) continue;
    await execute('INSERT INTO roles (id, name, description, is_system, created_at) VALUES (?, ?, ?, ?, ?)', [id, name, description, is_system, now()]);
    insertedRoleIds.add(id);
  }

  const permissionIds = new Map((await query('SELECT id, code FROM permissions')).map((p) => [p.code, p.id]));
  for (const [roleIdText, codes] of Object.entries(roleCodes)) {
    const roleId = Number(roleIdText);
    if (roleId === ADMIN_ROLE_ID) {
      // Admin always holds every permission, including ones added in later releases.
      await grantAll(roleId, codes, permissionIds);
      continue;
    }
    // Other built-in roles get their defaults once. After that the matrix an admin
    // saves is the source of truth and must survive restarts.
    const configured = await queryOne('SELECT COUNT(*) AS n FROM role_permissions WHERE role_id = ?', [roleId]);
    const alreadyConfigured = !insertedRoleIds.has(roleId) && Number(configured?.n) > 0;
    if (!alreadyConfigured) await grantAll(roleId, codes, permissionIds);
  }

  // Default products: by name, with the classic ids when they are free.
  for (let index = 0; index < products.length; index += 1) {
    const name = products[index];
    if (await queryOne('SELECT id FROM products WHERE productname = ?', [name])) continue;
    const wantedId = index + 1;
    const idTaken = await queryOne('SELECT id FROM products WHERE id = ?', [wantedId]);
    if (idTaken) await execute('INSERT INTO products (productname, created_at) VALUES (?, ?)', [name, now()]);
    else await execute('INSERT INTO products (id, productname, created_at) VALUES (?, ?, ?)', [wantedId, name, now()]);
  }

  // Company settings: created once, then owned by the Company Settings screen.
  if (!(await queryOne('SELECT id FROM company_settings LIMIT 1'))) {
    await execute(
      `INSERT INTO company_settings (id, company_name, address, tel, mobile, email, website, contact_no, uen, default_currency, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [defaultSettings.company_name, defaultSettings.address, defaultSettings.tel, defaultSettings.mobile, defaultSettings.email,
        defaultSettings.website, defaultSettings.contact_no, defaultSettings.uen, defaultSettings.default_currency, now(), now()]
    );
  }

  // First Admin account: created once from ADMIN_USERNAME / ADMIN_PASSWORD when no
  // active Admin exists. An existing admin's password is never overwritten here;
  // it is changed in Manage Users.
  const activeAdmins = await queryOne('SELECT COUNT(*) AS n FROM users WHERE role_id = ? AND is_active = 1', [ADMIN_ROLE_ID]);
  if (Number(activeAdmins?.n) === 0) {
    const adminUsername = (overrideUsername || process.env.ADMIN_USERNAME || 'admin').trim();
    const adminPassword = overridePassword || process.env.ADMIN_PASSWORD || 'admin';
    if (adminPassword === 'admin' && process.env.NODE_ENV === 'production') {
      console.warn('[seed] WARNING: creating the Admin account with the default password. Set ADMIN_PASSWORD and change it after first login.');
    }
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const existing = await queryOne('SELECT id FROM users WHERE username = ?', [adminUsername]);
    if (existing) {
      await execute('UPDATE users SET password = ?, role_id = ?, is_active = 1, updated_at = ? WHERE id = ?', [hashedPassword, ADMIN_ROLE_ID, now(), existing.id]);
    } else {
      await execute(
        'INSERT INTO users (name, username, email, password, role_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
        ['System Admin', adminUsername, 'admin@example.com', hashedPassword, ADMIN_ROLE_ID, now(), now()]
      );
    }
  }

  // Invoices saved before the GST-only flag existed get it now.
  await backfillGstOnly();
}

module.exports = { seedDefaults, permissionRows, roleRows, roleCodes };
