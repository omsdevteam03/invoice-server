import pool from '../config/db.js';

export const getAllInvoices = async () => {
  const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
  return result.rows;
};

export const saveInvoice = async (inv) => {
  const result = await pool.query(`
    INSERT INTO invoices (
      id, buyer_name, company, email, phone, date, due_date,
      status, items, tax, discount, total, amount_due, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (id) DO UPDATE SET
      buyer_name=$2, company=$3, email=$4, phone=$5, date=$6, due_date=$7,
      status=$8, items=$9, tax=$10, discount=$11, total=$12, amount_due=$13, notes=$14
    RETURNING *`,
    [
      inv.id, inv.buyerName, inv.company, inv.email, inv.phone,
      inv.date, inv.dueDate, inv.status,
      JSON.stringify(inv.items), inv.tax, inv.discount,
      inv.total, inv.amountDue, inv.notes
    ]
  );
  return result.rows[0];
};

export const deleteInvoice = async (id) => {
  await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
};