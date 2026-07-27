import pool from '../config/db.js';

export const getAllQuotations = async () => {
  const result = await pool.query('SELECT * FROM quotations ORDER BY created_at DESC');
  return result.rows;
};
export const saveQuotation = async (q) => {
  const result = await pool.query(`
    INSERT INTO quotations (
      id, name, company, email, phone, date, valid_until, status, amount,
      timeline, description, scope_of_work, deliverables, technology_used,
      timeline_desc, project_cost, payment_terms, terms, notes, items,
      custom_sections, signature,
      accent_color, accent_bg, issuer_name, issuer_address, issuer_phone,
      issuer_email, issuer_contact, project_title, client_address, logo,
      template_style
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
      $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33
    )
    ON CONFLICT (id) DO UPDATE SET
      name=$2, company=$3, email=$4, phone=$5, date=$6, valid_until=$7,
      status=$8, amount=$9, timeline=$10, description=$11, scope_of_work=$12,
      deliverables=$13, technology_used=$14, timeline_desc=$15, project_cost=$16,
      payment_terms=$17, terms=$18, notes=$19, items=$20, custom_sections=$21,
      signature=$22, accent_color=$23, accent_bg=$24, issuer_name=$25,
      issuer_address=$26, issuer_phone=$27, issuer_email=$28, issuer_contact=$29,
      project_title=$30, client_address=$31, logo=$32, template_style=$33
    RETURNING *`,
    [
      q.id, q.name, q.company, q.email, q.phone, q.date, q.validUntil,
      q.status, q.amount, q.timeline, q.description, q.scopeOfWork,
      q.deliverables, q.technologyUsed, q.timelineDesc, q.projectCost,
      q.paymentTerms, q.terms, q.notes,
      JSON.stringify(q.items), JSON.stringify(q.customSections || []), q.signature,
      q.accentColor, q.accentBg, q.issuerName, q.issuerAddress, q.issuerPhone,
      q.issuerEmail, q.issuerContact, q.projectTitle, q.clientAddress, q.logo,
      q.templateStyle
    ]
  );
  return result.rows[0];
};

export const deleteQuotation = async (id) => {
  await pool.query('DELETE FROM quotations WHERE id = $1', [id]);
};