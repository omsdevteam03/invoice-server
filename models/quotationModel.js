import pool from '../config/db.js';

export const getAllQuotations = async () => {
  const result = await pool.query('SELECT * FROM quotations WHERE deleted_at IS NULL ORDER BY created_at DESC');
  return result.rows;
};

const reserveNextQuotationNumber = async (client) => {
  const { rows } = await client.query(
    `SELECT quotation_prefix, quotation_number_length, quotation_yearly_reset,
            quotation_current_sequence, quotation_current_year
     FROM invoice_settings WHERE id = 1 FOR UPDATE`
  );
  const s = rows[0];
  if (!s) throw new Error('Invoice settings not configured');

  const currentYear = new Date().getFullYear();
  const resets = s.quotation_yearly_reset;
  const yearChanged = resets && s.quotation_current_year !== currentYear;

  const nextSeq = yearChanged ? 1 : (Number(s.quotation_current_sequence) || 0) + 1;
  const yearToUse = resets ? currentYear : s.quotation_current_year;

  await client.query(
    `UPDATE invoice_settings
     SET quotation_current_sequence = $1, quotation_current_year = $2, updated_at = NOW()
     WHERE id = 1`,
    [nextSeq, yearToUse]
  );

  const prefix = (s.quotation_prefix || 'QT').trim().replace(/-+$/, '');
  const len = Math.max(1, Number(s.quotation_number_length) || 4);
  const seqStr = String(nextSeq).padStart(len, '0');
  return resets ? `${prefix}-${yearToUse}-${seqStr}` : `${prefix}-${seqStr}`;
};

export const saveQuotation = async (q, isNew) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const id = isNew ? await reserveNextQuotationNumber(client) : q.id;
    if (!id) throw new Error('Missing quotation id for update');

     const result = await client.query(
  `INSERT INTO quotations (
    id, name, company, email, phone, date, valid_until, status, amount,
    timeline, description, scope_of_work, deliverables, technology_used,
    timeline_desc, project_cost, payment_terms, terms, notes, items,
    custom_sections, signature,
    accent_color, accent_bg, issuer_name, issuer_address, issuer_phone,
    issuer_email, issuer_contact, project_title, client_address, logo,
    template_style, cost_items, include_gst, gst_percent, gst_mode
  ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
    $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
  )
  ON CONFLICT (id) DO UPDATE SET
    name=$2, company=$3, email=$4, phone=$5, date=$6, valid_until=$7,
    status=$8, amount=$9, timeline=$10, description=$11, scope_of_work=$12,
    deliverables=$13, technology_used=$14, timeline_desc=$15, project_cost=$16,
    payment_terms=$17, terms=$18, notes=$19, items=$20, custom_sections=$21,
    signature=$22, accent_color=$23, accent_bg=$24, issuer_name=$25,
    issuer_address=$26, issuer_phone=$27, issuer_email=$28, issuer_contact=$29,
    project_title=$30, client_address=$31, logo=$32, template_style=$33,
    cost_items=$34, include_gst=$35, gst_percent=$36, gst_mode=$37,
    deleted_at=NULL
  RETURNING *`,
  [
    id, q.name, q.company, q.email, q.phone, q.date, q.validUntil,
    q.status, q.amount, q.timeline, q.description, q.scopeOfWork,
    q.deliverables, q.technologyUsed, q.timelineDesc, q.projectCost,
    q.paymentTerms, q.terms, q.notes,
    JSON.stringify(q.items), JSON.stringify(q.customSections || []), q.signature,
    q.accentColor, q.accentBg, q.issuerName, q.issuerAddress, q.issuerPhone,
    q.issuerEmail, q.issuerContact, q.projectTitle, q.clientAddress, q.logo,
    q.templateStyle, JSON.stringify(q.costItems || []), q.includeGst !== false, q.gstPercent ?? 18,
    q.gstMode || (q.includeGst === false ? 'without' : 'with')
  ]
);

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const deleteQuotation = async (id) => {
  await pool.query('UPDATE quotations SET deleted_at = NOW() WHERE id = $1', [id]);
};

export const getTrashedQuotations = async () => {
  const result = await pool.query('SELECT * FROM quotations WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
  return result.rows;
};

export const restoreQuotation = async (id) => {
  const result = await pool.query('UPDATE quotations SET deleted_at = NULL WHERE id = $1 RETURNING *', [id]);
  return result.rows[0];
};

export const permanentlyDeleteQuotation = async (id) => {
  await pool.query('DELETE FROM quotations WHERE id = $1', [id]);
};

export const purgeOldTrashedQuotations = async () => {
  await pool.query(`DELETE FROM quotations WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`);
};