import pool from '../config/db.js';

export const getAllInvoices = async () => {
  const result = await pool.query('SELECT * FROM invoices WHERE deleted_at IS NULL ORDER BY created_at DESC');
  return result.rows;
};
export const saveInvoice = async (inv) => {
  const result = await pool.query(`
    INSERT INTO invoices (
      id, invoice_no, buyer_name, buyer_company_name, buyer_address, buyer_mobile, buyer_gstin,
      date, due_date, status, gst_type, gst_percent, items, amount_paid, total, amount_due, notes, signature,
      company_name, company_address, company_gstin, logo, from_quotation_id, invoice_lang,
      payments, activity_log, converted_from_id, converted_invoice_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     ON CONFLICT (id) DO UPDATE SET
      invoice_no=$2, buyer_name=$3, buyer_company_name=$4, buyer_address=$5, buyer_mobile=$6, buyer_gstin=$7,
      date=$8, due_date=$9, status=$10, gst_type=$11, gst_percent=$12, items=$13, amount_paid=$14,
      total=$15, amount_due=$16, notes=$17, signature=$18,
      company_name=$19, company_address=$20, company_gstin=$21, logo=$22, from_quotation_id=$23,
      invoice_lang=$24,
      payments=$25, activity_log=$26, converted_from_id=$27, converted_invoice_id=$28,
      deleted_at=NULL
    RETURNING *`,
    [
      inv.id,
      inv.invoiceNo,
      inv.buyerName,
      inv.buyerCompanyName || null,  // ← NEW: client's company name
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
      inv.logo || null,
      inv.fromQuotationId || null,  // ← NEW: links this invoice back to its source quotation
      inv.invoiceLang === 'ta' ? 'ta' : 'en',
      JSON.stringify(inv.payments || []),
      JSON.stringify(inv.activityLog || []),
      inv.convertedFromId || null,
      inv.convertedInvoiceId || null,
    ]
  );
  return result.rows[0];
};

export const getInvoiceById = async (id) => {
  const result = await pool.query('SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL', [id]);
  return result.rows[0];
};

export const deleteInvoice = async (id) => {
  await pool.query('UPDATE invoices SET deleted_at = NOW() WHERE id = $1', [id]);
};

export const getTrashedInvoices = async () => {
  const result = await pool.query('SELECT * FROM invoices WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
  return result.rows;
};

export const restoreInvoice = async (id) => {
  const result = await pool.query('UPDATE invoices SET deleted_at = NULL WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
};

export const permanentlyDeleteInvoice = async (id) => {
  await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
};

export const purgeOldTrashedInvoices = async () => {
  await pool.query(`DELETE FROM invoices WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`);
};