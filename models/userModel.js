import pool from '../config/db.js';

export const findUserByEmail = async (email) => {
  console.log('Searching for email:', email);
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  console.log('Query result:', result.rows);
  return result.rows[0];
};

export const createUser = async (name, email, hashedPassword) => {
  const result = await pool.query(
    'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
    [name, email, hashedPassword]
  );
  return result.rows[0];
};