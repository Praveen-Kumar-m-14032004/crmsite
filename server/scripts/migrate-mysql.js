require('dotenv').config();

const mysql = require('mysql2/promise');
const { connect, getDb, close } = require('../src/config/db');

const TABLES = ['roles', 'permissions', 'role_permissions', 'users', 'company_settings', 'customers', 'products', 'invoices', 'invoice_items'];
const ID_TABLES = TABLES.filter((table) => !['role_permissions', 'company_settings'].includes(table));
const NUMERIC_FIELDS = {
  users: ['id', 'role_id', 'is_active'],
  roles: ['id', 'is_system'],
  permissions: ['id'],
  customers: ['id'],
  products: ['id'],
  invoices: ['id', 'customer_id', 'sub_amount', 'paid_amount', 'due_amount', 'is_gst_bill', 'version'],
  invoice_items: ['id', 'invoice_id', 'product_id', 'rate', 'quantity', 'total'],
  role_permissions: ['role_id', 'permission_id'],
};

function migrationConnection() {
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) throw new Error('DB_HOST, DB_USER, and DB_NAME are required for migration');
  return mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME, dateStrings: true });
}

async function main() {
  await connect();
  const source = await migrationConnection();
  const db = getDb();
  const counts = {};
  try {
    for (const table of TABLES) {
      const [rows] = await source.query(`SELECT * FROM ${table}`);
      const target = db.collection(table);
      let migrated = 0;
      for (const row of rows) {
        const document = { ...row };
        for (const field of NUMERIC_FIELDS[table] || []) {
          if (document[field] !== null && document[field] !== undefined) document[field] = Number(document[field]);
        }
        if (table === 'role_permissions') document._id = `${document.role_id}:${document.permission_id}`;
        if (table === 'company_settings') document._id = 'company_settings';
        const filter = table === 'role_permissions' ? { _id: document._id } : table === 'company_settings' ? { _id: document._id } : { id: Number(document.id) };
        await target.replaceOne(filter, document, { upsert: true });
        migrated += 1;
      }
      counts[table] = migrated;
    }
    for (const table of ID_TABLES) {
      const max = await db.collection(table).aggregate([{ $group: { _id: null, max: { $max: '$id' } } }]).toArray();
      if (max[0]?.max) await db.collection('counters').updateOne({ _id: table }, { $max: { value: Number(max[0].max) } }, { upsert: true });
    }
    console.log(`[migration] migrated ${Object.entries(counts).map(([table, count]) => `${table}=${count}`).join(', ')}`);
  } finally {
    await source.end();
    await close();
  }
}

main().catch(async (error) => { console.error(`[migration] failed: ${error.message}`); await close(); process.exitCode = 1; });
