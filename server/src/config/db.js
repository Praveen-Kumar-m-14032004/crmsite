require('dotenv').config();

const { MongoClient } = require('mongodb');

const DEFAULT_MONGODB_URI =
  'mongodb://praveenkumarm14032004_db_user:I4Gvfb5uFcCvcjy8@ac-yned1yg-shard-00-00.8ybyvlz.mongodb.net:27017,ac-yned1yg-shard-00-01.8ybyvlz.mongodb.net:27017,ac-yned1yg-shard-00-02.8ybyvlz.mongodb.net:27017/permit_declaration?ssl=true&replicaSet=atlas-v8zcw3-shard-0&authSource=admin&retryWrites=true&w=majority';

let client;
let database;

function mongoDatabaseName() {
  return process.env.MONGODB_DB || 'permit_declaration';
}

function getMongoUri() {
  return process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
}

async function connect() {
  const uri = getMongoUri();
  if (!uri) throw new Error('MONGODB_URI must be set');
  if (database) return database;

  client = new MongoClient(uri, {
    maxPoolSize: Number(process.env.MONGODB_POOL_SIZE) || 20,
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 5000,
  });
  await client.connect();
  database = client.db(mongoDatabaseName());

  await Promise.all([
    database.collection('roles').createIndex({ name: 1 }, { unique: true }),
    database.collection('permissions').createIndex({ code: 1 }, { unique: true }),
    database.collection('users').createIndex({ username: 1 }, { unique: true }),
    database.collection('customers').createIndex({ companyname: 1 }),
    database.collection('products').createIndex({ productname: 1 }),
    database.collection('invoices').createIndex({ invoice_no: 1 }, { unique: true }),
    database.collection('invoices').createIndex({ invoice_date: -1, id: -1 }),
    database.collection('invoices').createIndex({ status: 1 }),
    database.collection('invoices').createIndex({ payment_status: 1 }),
    database.collection('invoice_items').createIndex({ invoice_id: 1 }),
    database.collection('role_permissions').createIndex({ role_id: 1, permission_id: 1 }, { unique: true }),
  ]);
  return database;
}

function getDb() {
  if (!database) throw new Error('MongoDB is not connected');
  return database;
}

function getClient() {
  if (!client) throw new Error('MongoDB is not connected');
  return client;
}

async function close() {
  if (client) await client.close();
  client = null;
  database = null;
}

module.exports = { connect, getDb, getClient, close, mongoDatabaseName };
