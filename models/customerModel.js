import pool from '../config/db.js';

export const getAllCustomers = async () => {
  const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
  return result.rows;
};

export const saveCustomer = async (c) => {
  const result = await pool.query(`
    INSERT INTO customers (
      id, name, company, email, phone, status, type, category, total_billed
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (id) DO UPDATE SET
      name=$2, company=$3, email=$4, phone=$5,
      status=$6, type=$7, category=$8, total_billed=$9
    RETURNING *`,
    [
      c.id, c.name, c.company, c.email, c.phone,
      c.status, c.type, c.category, c.totalBilled
    ]
  );
  return result.rows[0];
};

export const deleteCustomer = async (id) => {
  await pool.query('DELETE FROM customers WHERE id = $1', [id]);
};