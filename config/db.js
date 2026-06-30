import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: 'jermi23',
  database: 'orangemega',
  port: 5432,
  max: 10,                    // max connections
  idleTimeoutMillis: 30000,   // close idle connections after 30s
  connectionTimeoutMillis: 2000, // timeout after 2s
});

pool.on('error', (err) => {
  console.error('DB connection lost! Reconnecting...', err.message);
});

pool.connect()
  .then(() => console.log('PostgreSQL Connected!'))
  .catch(err => console.error('DB Connection Error:', err));

export default pool;