import pool from '../config/db.js';

// scope = null  -> Admin: every invoice
// scope = [ids] -> other users: only their own company's invoices
// scope left out -> nothing
export const getAllInvoices = async (scope = []) => {
  const result = await pool.query(
    'SELECT * FROM invoices WHERE deleted_at IS NULL AND ($1::int[] IS NULL OR company_id = ANY($1)) ORDER BY created_at DESC',
    [scope]
  );
  return result.rows;
};

export const saveInvoice = async (inv, scope = [], ownCompanyId = null, creator = {}) => {
  const result = await pool.query(`
    INSERT INTO invoices (
      id, invoice_no, buyer_name, buyer_company_name, buyer_address, buyer_mobile, buyer_gstin,
      date, due_date, status, gst_type, gst_percent, items, amount_paid, total, amount_due, notes, signature,
      company_name, company_address, company_mobile, company_email, company_gstin,
      logo, from_quotation_id, invoice_lang,
      payments, activity_log, converted_from_id, converted_invoice_id, company_id,
      created_by, created_by_name, created_via,
      eway_bill_no, eway_bill_date, eway_bill_valid_upto,
      buyer_salutation, eway_bill_details
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,$24,$25,$26,
      $27,$28,$29,$30,$31,
      $32,$33,$34,
      $35,$36,$37,
      $38,$39
    )
    ON CONFLICT (id) DO UPDATE SET
      invoice_no=$2, buyer_name=$3, buyer_company_name=$4, buyer_address=$5, buyer_mobile=$6, buyer_gstin=$7,
      date=$8, due_date=$9, status=$10, gst_type=$11, gst_percent=$12, items=$13, amount_paid=$14,
      total=$15, amount_due=$16, notes=$17, signature=$18,
      company_name=$19, company_address=$20, company_mobile=$21, company_email=$22, company_gstin=$23,
      logo=$24, from_quotation_id=$25, invoice_lang=$26,
      payments=$27, activity_log=$28, converted_from_id=$29, converted_invoice_id=$30,
      eway_bill_no=$35, eway_bill_date=$36, eway_bill_valid_upto=$37,
      buyer_salutation=$38,
      eway_bill_details=$39,
      deleted_at=NULL
    WHERE ($40::int[] IS NULL OR invoices.company_id = ANY($40))
    RETURNING *`,
    [
      inv.id,                                           // $1
      inv.invoiceNo,                                    // $2
      inv.buyerName,                                    // $3
      inv.buyerCompanyName || null,                     // $4
      inv.buyerAddress || null,                         // $5
      inv.buyerMobile || null,                          // $6
      inv.buyerGSTIN || null,                           // $7
      inv.date || null,                                 // $8
      inv.dueDate || null,                              // $9
      inv.status,                                       // $10
      inv.gstType,                                      // $11
      inv.gstPercent || 18,                             // $12
      JSON.stringify(inv.items),                        // $13
      inv.amountPaid || 0,                              // $14
      inv.total,                                        // $15
      inv.amountDue,                                    // $16
      inv.notes || null,                                // $17
      inv.signature || null,                            // $18
      inv.companyName || null,                          // $19
      inv.companyAddress || null,                       // $20
      inv.companyMobile || null,                        // $21
      inv.companyEmail || null,                         // $22
      inv.companyGSTIN || null,                         // $23
      inv.logo || null,                                 // $24
      inv.fromQuotationId || null,                      // $25
      inv.invoiceLang === 'ta' ? 'ta' : 'en',           // $26
      JSON.stringify(inv.payments || []),               // $27
      JSON.stringify(inv.activityLog || []),            // $28
      inv.convertedFromId || null,                      // $29
      inv.convertedInvoiceId || null,                   // $30
      ownCompanyId,                                     // $31
      creator.id != null ? String(creator.id) : null,   // $32
      creator.name || null,                             // $33
      creator.via || null,                              // $34
      inv.ewayBillNo || null,                           // $35
      inv.ewayBillDate || null,                         // $36
      inv.ewayBillValidUpto || null,                    // $37
      inv.buyerSalutation || null,                      // $38
      inv.ewayBillDetails ? JSON.stringify(inv.ewayBillDetails) : null, // $39
      scope,                                            // $40
    ]
  );
  return result.rows[0];
};

export const getInvoiceById = async (id, scope = []) => {
  const result = await pool.query(
    'SELECT * FROM invoices WHERE id = $2 AND deleted_at IS NULL AND ($1::int[] IS NULL OR company_id = ANY($1))',
    [scope, id]
  );
  return result.rows[0];
};

export const deleteInvoice = async (id, scope = []) => {
  await pool.query(
    'UPDATE invoices SET deleted_at = NOW() WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1))',
    [scope, id]
  );
};

export const getTrashedInvoices = async (scope = []) => {
  const result = await pool.query(
    'SELECT * FROM invoices WHERE deleted_at IS NOT NULL AND ($1::int[] IS NULL OR company_id = ANY($1)) ORDER BY deleted_at DESC',
    [scope]
  );
  return result.rows;
};

export const restoreInvoice = async (id, scope = []) => {
  const result = await pool.query(
    'UPDATE invoices SET deleted_at = NULL WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1)) RETURNING *',
    [scope, id]
  );
  return result.rows[0];
};

export const permanentlyDeleteInvoice = async (id, scope = []) => {
  await pool.query(
    'DELETE FROM invoices WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1))',
    [scope, id]
  );
};

export const purgeOldTrashedInvoices = async () => {
  await pool.query(`DELETE FROM invoices WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`);
};