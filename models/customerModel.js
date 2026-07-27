import pool from '../config/db.js';

export const getAllCustomers = async () => {
  const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
  return result.rows;
};

export const saveCustomer = async (c) => {
  const result = await pool.query(`
    INSERT INTO customers (
      id, name, company, email, phone, phones, support_number,
      status, type, category, total_billed,
      address, addresses, since, notes, tags
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (id) DO UPDATE SET
      name=$2, company=$3, email=$4, phone=$5, phones=$6, support_number=$7,
      status=$8, type=$9, category=$10, total_billed=$11,
      address=$12, addresses=$13, since=$14, notes=$15, tags=$16
    RETURNING *`,
    [
      c.id, c.name, c.company, c.email, c.phone,
      JSON.stringify(c.phones || []),
      c.supportNumber || null,
      c.status, c.type, c.category, c.totalBilled,
      c.address || null,
      JSON.stringify(c.addresses || []),
      c.since || null,
      JSON.stringify(c.notes || []),
      c.tags && c.tags.length ? c.tags : [],
    ]
  );
  return result.rows[0];
};

export const deleteCustomer = async (id) => {
  await pool.query('DELETE FROM customers WHERE id = $1', [id]);
};