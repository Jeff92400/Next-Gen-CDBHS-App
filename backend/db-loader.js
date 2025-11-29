// Database loader - uses PostgreSQL if DATABASE_URL is set, otherwise SQLite
if (process.env.DATABASE_URL) {
  console.log('Loading PostgreSQL database module');
  module.exports = require('./db-postgres');
} else {
  console.log('Loading SQLite database module');
  module.exports = require('./db');
}
