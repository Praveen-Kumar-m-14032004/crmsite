require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'permit-declaration-secret-da41d4f289e9d0410ad09455e84f577c';
  if (process.env.NODE_ENV === 'production') {
    console.warn('[warning] JWT_SECRET not provided; using fallback default secret.');
  }
}

const { connect, getDb, close, mongoDatabaseName } = require('./src/config/db');
const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');
const customerRoutes = require('./src/routes/customers');
const productRoutes = require('./src/routes/products');
const invoiceRoutes = require('./src/routes/invoices');
const quotationRoutes = require('./src/routes/quotations');
const reportRoutes = require('./src/routes/reports');
const roleRoutes = require('./src/routes/roles');
const permissionRoutes = require('./src/routes/permissions');
const userRoutes = require('./src/routes/users');
const settingsRoutes = require('./src/routes/settings');

const app = express();

app.use(compression({ threshold: 1024 }));
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/company-settings', settingsRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    await getDb().command({ ping: 1 });
    res.json({ status: 'ok' });
  } catch (_err) {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ message: 'Endpoint not found' }));

// Serve React frontend in production with aggressive caching for hashed assets
const clientPath = path.join(__dirname, '..', 'client', 'dist');

// Vite-hashed assets (JS/CSS/images with content hashes in filenames) — cache for 1 year
app.use('/assets', express.static(path.join(clientPath, 'assets'), {
  maxAge: '1y',
  immutable: true,
}));

// Other static files — cache for 1 hour
app.use(express.static(clientPath, {
  maxAge: '1h',
  etag: true,
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }

  res.sendFile(path.join(clientPath, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);

  // Deleting a record another table still points at - report it as a conflict the
  // user can act on rather than a generic 500.
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451 || err.code === 'MONGO_REFERENCE_CONFLICT') {
    return res.status(409).json({
      message: 'This record is still used by existing invoices and cannot be deleted.',
    });
  }
  if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062 || err.code === 11000) {
    return res.status(409).json({ message: 'That value already exists.' });
  }
  if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.name === 'MongoServerSelectionError') {
    return res.status(503).json({
      message: 'Cannot reach MongoDB. Check MONGODB_URI and the database deployment.',
    });
  }

  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connect();
    await getDb().command({ ping: 1 });
    console.log(`[db] connected to MongoDB database ${mongoDatabaseName()}`);

    try {
      const { seedDefaults } = require('./src/utils/seedHelper');
      await seedDefaults();
      console.log('[seed] default roles, permissions, settings and admin user verified');
    } catch (seedErr) {
      console.warn('[seed] warning: auto-seed had error:', seedErr.message);
    }
  } catch (err) {
    console.error('\n[db] Could not connect to MongoDB.');
    console.error(`     ${err.code || ''} ${err.message}`);
    console.error('     Set MONGODB_URI to a reachable MongoDB deployment.\n');
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

  const shutdown = async () => { await close(); process.exit(0); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start();
