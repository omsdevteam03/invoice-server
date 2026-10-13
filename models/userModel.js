import pool from '../config/db.js';

export const findUserByEmail = async (email) => {
  const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [(email || '').trim()]);
  return result.rows[0];
};

export const createUser = async (name, email, hashedPassword) => {
  const result = await pool.query(
    'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
    [name, email, hashedPassword]
  );
  return result.rows[0];
};