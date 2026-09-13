require('dotenv').config();

// Use MySQL locally, MySQL on Render (no SQLite needed)
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'permit_declaration',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 20,
  queueLimit: 0,
  enableKeepAlive: true,
  decimalNumbers: true,
  dateStrings: true,
});

module.exports = pool;
