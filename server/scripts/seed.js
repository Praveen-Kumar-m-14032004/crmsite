require('dotenv').config();

const bcrypt = require('bcryptjs');
const { connect, getDb, close } = require('../src/config/db');
const { now } = require('../src/utils/mongo');

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
const products = ['GST', 'IMPORT DECLARATION', 'EXPORT DECLARATION', 'CANCELLATION', 'CARGO CLEARANCE AND TRANSPORTATION', 'ITEM COST', 'IMPORTER OF THE RECORD (USING CHOLA AS IMPORTER)', 'LICENSE (USING CHOLA LICENSE)'];

async function main() {
  await connect();
  const db = getDb();
  const permissions = db.collection('permissions');
  for (let index = 0; index < permissionRows.length; index += 1) {
    const [code, module, action] = permissionRows[index];
    await permissions.updateOne({ code }, { $setOnInsert: { id: index + 1, code, module, action } }, { upsert: true });
  }
  for (const [id, name, description, is_system] of roleRows) await db.collection('roles').updateOne({ id }, { $setOnInsert: { id, name, description, is_system, created_at: now() } }, { upsert: true });
  const permissionDocs = await permissions.find().toArray();
  const permissionIds = new Map(permissionDocs.map((permission) => [permission.code, permission.id]));
  for (const [role_id, codes] of Object.entries(roleCodes)) for (const code of codes) await db.collection('role_permissions').updateOne({ _id: `${role_id}:${permissionIds.get(code)}` }, { $set: { role_id: Number(role_id), permission_id: permissionIds.get(code) } }, { upsert: true });
  for (let index = 0; index < products.length; index += 1) await db.collection('products').updateOne({ productname: products[index] }, { $setOnInsert: { id: index + 1, productname: products[index], created_at: now() } }, { upsert: true });
  await db.collection('company_settings').updateOne({ _id: 'company_settings' }, { $setOnInsert: { id: 1, company_name: 'Chola Logistics Pte Ltd', default_currency: 'SGD', created_at: now() } }, { upsert: true });
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const password = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await db.collection('users').updateOne({ username: process.env.ADMIN_USERNAME }, { $set: { password, username: process.env.ADMIN_USERNAME, role_id: 1, is_active: 1 }, $setOnInsert: { id: 1, name: 'System Admin', created_at: now() } }, { upsert: true });
  }
  console.log('[seed] roles, permissions, products, and company settings are ready');
  await close();
}
main().catch(async (error) => { console.error(`[seed] failed: ${error.message}`); await close(); process.exitCode = 1; });
