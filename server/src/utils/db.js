/**
 * Small helpers over the MySQL pool so controllers read naturally.
 *
 *   const rows = await query('SELECT ... WHERE id = ?', [id]);
 *   const row  = await queryOne('SELECT ...', [...]);
 *   const res  = await execute('INSERT ...', [...]);   // res.insertId, res.affectedRows
 *   await withTransaction(async (tx) => { await tx.execute(...); });
 *
 * All statements go through `query` (client-side parameter binding), which also
 * accepts numbers for LIMIT / OFFSET.
 */
const { getPool } = require('../config/db');

async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function execute(sql, params = []) {
  const [result] = await getPool().query(sql, params);
  return result;
}

function bind(conn) {
  return {
    query: async (sql, params = []) => (await conn.query(sql, params))[0],
    queryOne: async (sql, params = []) => ((await conn.query(sql, params))[0][0] || null),
    execute: async (sql, params = []) => (await conn.query(sql, params))[0],
  };
}

/** Run `fn(tx)` inside one transaction; rolls back on any throw. */
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(bind(conn));
    await conn.commit();
    return out;
  } catch (err) {
    try { await conn.rollback(); } catch { /* connection may already be gone */ }
    throw err;
  } finally {
    conn.release();
  }
}

function numericId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Current time as a MySQL DATETIME(3) string in UTC. */
function now() {
  return new Date().toISOString().slice(0, 23).replace('T', ' ');
}

function isDuplicateError(error) {
  return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
}

/** `%term%` with LIKE wildcards in the term escaped. */
function likeTerm(term) {
  return `%${String(term ?? '').replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toJson(value) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

module.exports = { query, queryOne, execute, withTransaction, numericId, now, isDuplicateError, likeTerm, parseJson, toJson };
