import pool from '../config/db.js';

// ── Company ──
export const getCompanySettings = async () => {
  const result = await pool.query('SELECT * FROM company_settings WHERE id = 1');
  return result.rows[0];
};

export const saveCompanySettingsRow = async (c) => {
  const result = await pool.query(`
    UPDATE company_settings SET
      company_name = $1, company_email = $2, company_phone = $3,
      company_address = $4, gstin = $5, website = $6, logo = $7,
      updated_at = NOW()
    WHERE id = 1
    RETURNING *`,
    [c.companyName, c.companyEmail, c.companyPhone, c.companyAddress, c.gstin, c.website, c.logo]
  );
  return result.rows[0];
};

// ── Invoice & Quotation ──
export const getInvoiceSettings = async () => {
  const result = await pool.query('SELECT * FROM invoice_settings WHERE id = 1');
  return result.rows[0];
};

export const saveInvoiceSettingsRow = async (c) => {
  const result = await pool.query(`
    UPDATE invoice_settings SET
      invoice_prefix = $1, quotation_prefix = $2, gst_percent = $3,
      currency = $4, default_payment_terms = $5, default_notes = $6,
      proforma_prefix = $7,
      updated_at = NOW()
    WHERE id = 1
    RETURNING *`,
    [c.invoicePrefix, c.quotationPrefix, c.gstPercent, c.currency, c.defaultPaymentTerms, c.defaultNotes, c.proformaPrefix]
  );
  return result.rows[0];
};

// ── Profile ──
export const getAdminProfile = async () => {
  const result = await pool.query('SELECT * FROM admin_profile WHERE id = 1');
  return result.rows[0];
};

export const saveAdminProfileRow = async (p) => {
  const result = await pool.query(`
    UPDATE admin_profile SET admin_name = $1, admin_email = $2, updated_at = NOW()
    WHERE id = 1
    RETURNING *`,
    [p.adminName, p.adminEmail]
  );
  return result.rows[0];
};

export const getPasswordHash = async () => {
  const result = await pool.query('SELECT password_hash FROM admin_profile WHERE id = 1');
  return result.rows[0]?.password_hash;
};

export const updatePasswordHash = async (hash) => {
  await pool.query('UPDATE admin_profile SET password_hash = $1, updated_at = NOW() WHERE id = 1', [hash]);
};

// ── Notifications ──
export const getNotificationSettings = async () => {
  const result = await pool.query('SELECT * FROM notification_settings WHERE id = 1');
  return result.rows[0];
};

export const saveNotificationSettingsRow = async (n) => {
  const result = await pool.query(`
    UPDATE notification_settings SET
      notify_on_invoice = $1, notify_on_quotation = $2, notify_on_payment = $3,
      updated_at = NOW()
    WHERE id = 1
    RETURNING *`,
    [n.notifyOnInvoice, n.notifyOnQuotation, n.notifyOnPayment]
  );
  return result.rows[0];
};