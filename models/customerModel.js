
import pool from '../config/db.js';
export const getAllCustomers = async () => {
  const result = await pool.query('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY created_at DESC');
  return result.rows;
};

export const saveCustomer = async (c) => {
  const result = await pool.query(`
    INSERT INTO customers (
      id, name, company, email, emails, phone, phones, support_number,
      whatsapp, whatsapps,
      status, type, category, total_billed,
      address, addresses, since, notes, tags,
      city, state, country, gst_number, customer_type
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
    ON CONFLICT (id) DO UPDATE SET
      name=$2, company=$3, email=$4, emails=$5, phone=$6, phones=$7, support_number=$8,
      whatsapp=$9, whatsapps=$10,
      status=$11, type=$12, category=$13, total_billed=$14,
      address=$15, addresses=$16, since=$17, notes=$18, tags=$19,
      city=$20, state=$21, country=$22, gst_number=$23, customer_type=$24,
      deleted_at=NULL
    RETURNING *`,
    [
      c.id, c.name, c.company, c.email,
      JSON.stringify(c.emails || []),
      c.phone,
      JSON.stringify(c.phones || []),
      c.supportNumber || null,
      c.whatsapp || null,
      JSON.stringify(c.whatsapps || []),
      c.status,
      c.type || c.customerType || 'Business',
      c.category || null,
      c.totalBilled ?? 0,
      c.address || null,
      JSON.stringify(c.addresses || []),
      c.since || null,
      JSON.stringify(c.notes || []),
      c.tags && c.tags.length ? c.tags : [],
      c.city || null,
      c.state || null,
      c.country || 'India',
      c.gstNumber || null,
      c.customerType || 'Business',
    ]
  );
  return result.rows[0];
};

export const deleteCustomer = async (id) => {
  await pool.query('UPDATE customers SET deleted_at = NOW() WHERE id = $1', [id]);
};

export const getTrashedCustomers = async () => {
  const result = await pool.query('SELECT * FROM customers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
  return result.rows;
};

export const restoreCustomer = async (id) => {
  const result = await pool.query('UPDATE customers SET deleted_at = NULL WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
};

export const permanentlyDeleteCustomer = async (id) => {
  await pool.query('DELETE FROM customers WHERE id = $1', [id]);
};

export const purgeOldTrashedCustomers = async () => {
  await pool.query(`DELETE FROM customers WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`);
};