require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

/**
 * MySQL / MariaDB connection - the only database the API uses.
 *
 * Configured with DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (and DB_POOL_SIZE).
 * Hosted MySQL (Aiven, PlanetScale, ...) requires TLS: set DB_SSL=true and either
 * DB_SSL_CA_PATH (path to the provider's CA certificate, e.g. a Render secret file)
 * or DB_SSL_CA (the PEM text itself). Certificate verification is never disabled.
 *
 * connect() creates the database (when the user may) and every table when they do
 * not exist yet, so a fresh server needs no manual SQL.
 *
 * Notes on how rows come back:
 *   - dateStrings: DATE and DATETIME columns are returned as plain strings
 *     ('2026-10-05', '2026-10-05 09:46:17.090'), never shifted by a timezone.
 *   - decimalNumbers: DECIMAL columns are returned as JavaScript numbers.
 */

let pool = null;

function sslConfig() {
  const mode = String(process.env.DB_SSL || '').trim().toLowerCase();
  if (!mode || ['false', '0', 'off', 'no', 'disabled'].includes(mode)) return undefined;
  const ssl = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
  if (process.env.DB_SSL_CA_PATH) {
    const caPath = path.resolve(__dirname, '..', '..', process.env.DB_SSL_CA_PATH);
    ssl.ca = fs.readFileSync(fs.existsSync(caPath) ? caPath : process.env.DB_SSL_CA_PATH, 'utf8');
  } else if (process.env.DB_SSL_CA) {
    ssl.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  }
  return ssl;
}

function config() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'permit_declaration',
    ssl: sslConfig(),
  };
}

function databaseName() {
  return config().database;
}

const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS roles (
     id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(100) NOT NULL,
     description VARCHAR(255) NULL,
     is_system TINYINT(1) NOT NULL DEFAULT 0,
     created_at DATETIME(3) NULL,
     updated_at DATETIME(3) NULL,
     UNIQUE KEY uq_roles_name (name)
   ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS permissions (
     id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     code VARCHAR(100) NOT NULL,
     module VARCHAR(50) NOT NULL,
     action VARCHAR(50) NOT NULL,
     UNIQUE KEY uq_permissions_code (code)
   ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS role_permissions (
     role_id INT UNSIGNED NOT NULL,
     permission_id INT UNSIGNED NOT NULL,
     PRIMARY KEY (role_id, permission_id),
     KEY idx_rp_permission (permission_id),
     CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
     CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
   ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS users (
     id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     name VARCHAR(150) NULL,
     username VARCHAR(100) NOT NULL,
     email VARCHAR(190) NULL,
     password VARCHAR(255) NOT NULL,
     role_id INT UNSIGNED NULL,
     is_active TINYINT(1) NOT NULL DEFAULT 1,
     created_at DATETIME(3) NULL,
     updated_at DATETIME(3) NULL,
     UNIQUE KEY uq_users_username (username),
     KEY idx_users_role (role_id)
   ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS customers (
     id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     companyname VARCHAR(255) NOT NULL,
     person_incharge VARCHAR(150) NULL,
     mobile_no VARCHAR(50) NULL,
     email VARCHAR(190) NULL,
     address TEXT NULL,
     created_at DATETIME(3) NULL,
     updated_at DATETIME(3) NULL,
     KEY idx_customers_name (companyname),
     KEY idx_customers_created (created_at)
   ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS products (
     id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     productname VARCHAR(255) NOT NULL,
     created_at DATETIME(3) NULL,
     updated_at DATETIME(3) NULL,
     KEY idx_products_name (productname)
   ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS invoices (
     id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     invoice_no VARCHAR(50) NOT NULL,
     invoice_date DATE NULL,
     customer_id INT UNSIGNED NULL,
     customer_contact VARCHAR(50) NULL,
     sub_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
     paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
     due_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
     payment_type VARCHAR(50) NULL,
     payment_status VARCHAR(50) NULL,
     status VARCHAR(30) NOT NULL DEFAULT 'Unpaid',
     is_gst_bill TINYINT(1) NOT NULL DEFAULT 0,
     is_gst_only TINYINT(1) NULL,
     is_deleted TINYINT(1) NOT NULL DEFAULT 0,
     deleted_at DATETIME(3) NULL,
     version INT UNSIGNED NOT NULL DEFAULT 0,
     created_at DATETIME(3) NULL,
     updated_at DATETIME(3) NULL,
     UNIQUE KEY uq_invoices_no (invoice_no),
     KEY idx_invoices_customer (customer_id),
     KEY idx_invoices_list (is_deleted, invoice_date, id),
     KEY idx_invoices_status (is_deleted, status),
     KEY idx_invoices_payment (is_deleted, payment_status),
     KEY idx_invoices_trash (is_deleted, deleted_at)
   ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS invoice_items (
     id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     invoice_id INT UNSIGNED NOT NULL,
     product_id INT UNSIGNED NOT NULL DEFAULT 0,
     description TEXT NULL,
     rate DECIMAL(14,2) NOT NULL DEFAULT 0,
     quantity DECIMAL(14,2) NOT NULL DEFAULT 1,
     total DECIMAL(14,2) NOT NULL DEFAULT 0,
     created_at DATETIME(3) NULL,
     updated_at DATETIME(3) NULL,
     KEY idx_items_invoice (invoice_id),
     KEY idx_items_product (product_id)
   ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS quotations (
     id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
     quotation_no VARCHAR(50) NOT NULL,
     customer_id INT UNSIGNED NULL,
     companyname VARCHAR(255) NOT NULL,
     address TEXT NULL,
     person_incharge VARCHAR(150) NULL,
     mobile_no VARCHAR(50) NULL,
     customer_contact VARCHAR(50) NULL,
     quotation_date DATE NULL,
     items LONGTEXT NULL,
     sub_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
     notes TEXT NULL,
     doc_title VARCHAR(255) NULL,
     item_cost TEXT NULL,
     turnaround LONGTEXT NULL,
     procedures TEXT NULL,
     operating_hours TEXT NULL,
     terms LONGTEXT NULL,
     closing_note TEXT NULL,
     visibility TEXT NULL,
     created_at DATETIME(3) NULL,
     updated_at DATETIME(3) NULL,
     UNIQUE KEY uq_quotations_no (quotation_no),
     KEY idx_quotations_customer (customer_id),
     KEY idx_quotations_date (quotation_date)
   ) ${TABLE_OPTIONS}`,
  `CREATE TABLE IF NOT EXISTS company_settings (
     id INT UNSIGNED NOT NULL PRIMARY KEY,
     company_name VARCHAR(255) NOT NULL,
     address TEXT NULL,
     tel VARCHAR(50) NULL,
     mobile VARCHAR(50) NULL,
     email VARCHAR(190) NULL,
     website VARCHAR(190) NULL,
     contact_no VARCHAR(50) NULL,
     uen VARCHAR(50) NULL,
     default_currency VARCHAR(10) NOT NULL DEFAULT 'SGD',
     created_at DATETIME(3) NULL,
     updated_at DATETIME(3) NULL
   ) ${TABLE_OPTIONS}`,
];

function assertSafeName(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`DB_NAME "${name}" may only contain letters, digits and underscores`);
  }
}

/**
 * Create the database when it does not exist. Hosted providers often give the
 * app user no CREATE DATABASE right but pre-create the database (Aiven: defaultdb);
 * in that case the error is reported and the pool connection decides.
 */
async function ensureDatabase() {
  const { database, ...server } = config();
  assertSafeName(database);
  const conn = await mysql.createConnection({ ...server, charset: 'utf8mb4' });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (err) {
    if (err.code === 'ER_DBACCESS_DENIED_ERROR' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.errno === 1044) {
      console.warn(`[db] no permission to create database "${database}" - assuming it already exists`);
    } else {
      throw err;
    }
  } finally {
    await conn.end();
  }
}

async function connect() {
  if (pool) return pool;
  await ensureDatabase();
  pool = mysql.createPool({
    ...config(),
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    dateStrings: true,
    decimalNumbers: true,
    timezone: 'Z',
    namedPlaceholders: false,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
  for (const statement of SCHEMA) {
    await pool.query(statement);
  }
  return pool;
}

function getPool() {
  if (!pool) throw new Error('MySQL is not connected');
  return pool;
}

async function close() {
  if (pool) await pool.end();
  pool = null;
}

module.exports = { connect, getPool, close, databaseName, config };
