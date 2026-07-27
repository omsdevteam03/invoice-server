import pool from '../config/db.js';

export const getAllInvoices = async () => {
  const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
  return result.rows;
};

export const saveInvoice = async (inv) => {
  const result = await pool.query(`
    INSERT INTO invoices (
      id, invoice_no, buyer_name, buyer_address, buyer_mobile, buyer_gstin,
      date, due_date, status, gst_type, gst_percent, items, amount_paid, total, amount_due, notes, signature,
      company_name, company_address, company_gstin, logo
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    ON CONFLICT (id) DO UPDATE SET
      invoice_no=$2, buyer_name=$3, buyer_address=$4, buyer_mobile=$5, buyer_gstin=$6,
      date=$7, due_date=$8, status=$9, gst_type=$10, gst_percent=$11, items=$12, amount_paid=$13,
      total=$14, amount_due=$15, notes=$16, signature=$17,
      company_name=$18, company_address=$19, company_gstin=$20, logo=$21
    RETURNING *`,
    [
      inv.id,
      inv.invoiceNo,
      inv.buyerName,
      inv.buyerAddress || null,
      inv.buyerMobile || null,
      inv.buyerGSTIN || null,
      inv.date || null,
      inv.dueDate || null,          // "" -> null, avoids invalid date error
      inv.status,
      inv.gstType,
      inv.gstPercent || 18,
      JSON.stringify(inv.items),
      inv.amountPaid || 0,
      inv.total,
      inv.amountDue,
      inv.notes || null,
      inv.signature || null,        // undefined -> null, avoids pg param error
      inv.companyName || null,
      inv.companyAddress || null,
      inv.companyGSTIN || null,
      inv.logo || null,             // ← new
    ]
  );
  return result.rows[0];
};

export const deleteInvoice = async (id) => {
  await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
};