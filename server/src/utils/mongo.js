const { getDb } = require('../config/db');

const COLLECTIONS = [
  'roles', 'permissions', 'role_permissions', 'users', 'company_settings',
  'customers', 'products', 'invoices', 'invoice_items', 'quotations',
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

/**
 * Move a counter forward to the highest `id` already stored in the collection.
 * Seeded rows (roles 1-4, products 1-8) and migrated data are written with fixed
 * ids that bypass the counter, so without this nextId() would hand out an id that
 * is already taken and every create would fail with a duplicate-key error.
 */
async function syncCounter(name) {
  const [top] = await getDb().collection(name)
    .find({ id: { $type: 'number' } }, { projection: { id: 1 } })
    .sort({ id: -1 })
    .limit(1)
    .toArray();
  const maxId = Number(top?.id) || 0;
  if (!maxId) return 0;
  await getDb().collection('counters').updateOne(
    { _id: name },
    { $max: { value: maxId } },
    { upsert: true },
  );
  return maxId;
}

function isDuplicateError(error) {
  return error?.code === 11000;
}

function now() {
  return new Date().toISOString();
}

module.exports = { collection, numericId, nextId, nextIds, syncCounter, isDuplicateError, now };
