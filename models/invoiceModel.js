import pool from '../config/db.js';

export const getAllInvoices = async () => {
  const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
  return result.rows;
};

export const saveInvoice = async (inv) => {
  const result = await pool.query(`
    INSERT INTO invoices (
      id, invoice_no, buyer_name, buyer_address, buyer_mobile, buyer_gstin,
      date, due_date, status, gst_type, items, amount_paid, total, amount_due, notes, signature
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (id) DO UPDATE SET
      invoice_no=$2, buyer_name=$3, buyer_address=$4, buyer_mobile=$5, buyer_gstin=$6,
      date=$7, due_date=$8, status=$9, gst_type=$10, items=$11, amount_paid=$12,
      total=$13, amount_due=$14, notes=$15, signature=$16
    RETURNING *`,
    [
      inv.id, inv.invoiceNo, inv.buyerName, inv.buyerAddress, inv.buyerMobile, inv.buyerGSTIN,
      inv.date, inv.dueDate, inv.status, inv.gstType,
      JSON.stringify(inv.items), inv.amountPaid || 0,
      inv.total, inv.amountDue, inv.notes, inv.signature
    ]
  );
  return result.rows[0];
};

export const deleteInvoice = async (id) => {
  await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
};