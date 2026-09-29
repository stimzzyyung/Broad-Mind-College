require('dotenv').config();
const db = require('./db');
const seed = require('./seed');

async function main() {
  const data = seed({ writeFile: false });
  await db.initialize({ allowEmpty: true });
  await db.seedDatabase(data);
  await db.close();
  console.log('Sample school data has been seeded into MySQL.');
}

main().catch(async (error) => {
  console.error('Unable to seed MySQL:', error.message);
  await db.close();
  process.exitCode = 1;
});
