require('dotenv').config();
const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  process.env.JWT_SECRET = 'local-development-jwt-secret';
}

const pool = require('./src/config/db');
const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');
const customerRoutes = require('./src/routes/customers');
const productRoutes = require('./src/routes/products');
const invoiceRoutes = require('./src/routes/invoices');
const reportRoutes = require('./src/routes/reports');
const roleRoutes = require('./src/routes/roles');
const permissionRoutes = require('./src/routes/permissions');
const userRoutes = require('./src/routes/users');
const settingsRoutes = require('./src/routes/settings');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/company-settings', settingsRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api', (_req, res) => res.status(404).json({ message: 'Endpoint not found' }));

app.use((err, _req, res, _next) => {
  console.error(err);

  // Deleting a record another table still points at - report it as a conflict the
  // user can act on rather than a generic 500.
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
    return res.status(409).json({
      message: 'This record is still used by existing invoices and cannot be deleted.',
    });
  }
  if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
    return res.status(409).json({ message: 'That value already exists.' });
  }
  if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ER_ACCESS_DENIED_ERROR') {
    return res.status(503).json({
      message: 'Cannot reach the database. Is MySQL running in XAMPP?',
    });
  }

  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 5000;

async function start() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log(`[db] connected to ${process.env.DB_NAME || 'permit_declaration'}`);
  } catch (err) {
    console.error('\n[db] Could not connect to MySQL.');
    console.error(`     ${err.code || ''} ${err.message}`);
    console.error('     On Render: Add a MySQL database service.');
    console.error('     Locally: Start MySQL in XAMPP, import schema.sql, check .env\n');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`[api] Permit Declaration API listening on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[api] Port ${PORT} is already in use - another server is still running.`);
      console.error('      Stop it, then start again. On Windows:');
      console.error(`        netstat -ano | findstr :${PORT}`);
      console.error('        taskkill /PID <pid> /F');
      console.error(`      Or set a different PORT in server/.env\n`);
      process.exit(1);
    }
    throw err;
  });
}

start();
