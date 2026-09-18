const { getDb } = require('../config/db');

const COLLECTIONS = [
  'roles', 'permissions', 'role_permissions', 'users', 'company_settings',
  'customers', 'products', 'invoices', 'invoice_items',
];

function collection(name) {
  if (!COLLECTIONS.includes(name)) throw new Error(`Unknown collection: ${name}`);
  return getDb().collection(name);
}

function numericId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function nextId(name, session) {
  const result = await getDb().collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after', session },
  );
  // New driver returns doc directly; old driver wraps in result.value
  const doc = result?.value !== undefined && typeof result.value === 'object' ? result.value : result;
  return doc.value;
}

async function nextIds(name, count = 1, session) {
  if (count <= 0) return [];
  const result = await getDb().collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { value: count } },
    { upsert: true, returnDocument: 'after', session },
  );
  const doc = result?.value !== undefined && typeof result.value === 'object' ? result.value : result;
  const endId = doc.value;
  const startId = endId - count + 1;
  return Array.from({ length: count }, (_, i) => startId + i);
}

function isDuplicateError(error) {
  return error?.code === 11000;
}

function now() {
  return new Date().toISOString();
}

module.exports = { collection, numericId, nextId, nextIds, isDuplicateError, now };