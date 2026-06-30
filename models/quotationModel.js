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
      custom_sections, signature
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
    )
    ON CONFLICT (id) DO UPDATE SET
      name=$2, company=$3, email=$4, phone=$5, date=$6, valid_until=$7,
      status=$8, amount=$9, timeline=$10, description=$11, scope_of_work=$12,
      deliverables=$13, technology_used=$14, timeline_desc=$15, project_cost=$16,
      payment_terms=$17, terms=$18, notes=$19, items=$20, custom_sections=$21,
      signature=$22
    RETURNING *`,
    [
      q.id, q.name, q.company, q.email, q.phone, q.date, q.validUntil,
      q.status, q.amount, q.timeline, q.description, q.scopeOfWork,
      q.deliverables, q.technologyUsed, q.timelineDesc, q.projectCost,
      q.paymentTerms, q.terms, q.notes,
      JSON.stringify(q.items), JSON.stringify(q.customSections || []), q.signature
    ]
  );
  return result.rows[0];
};

export const deleteQuotation = async (id) => {
  await pool.query('DELETE FROM quotations WHERE id = $1', [id]);
};