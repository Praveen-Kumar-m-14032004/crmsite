require('dotenv').config();

const { connect, close, databaseName } = require('../src/config/db');
const { seedDefaults } = require('../src/utils/seedHelper');

async function main() {
  await connect();
  await seedDefaults();
  console.log(`[seed] MySQL database ${databaseName()}: admin user, roles, permissions, products and company settings are ready`);
  await close();
}
main().catch(async (error) => { console.error(`[seed] failed: ${error.message}`); await close(); process.exitCode = 1; });
