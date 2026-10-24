import pool from '../config/db.js';

// scope = null  -> Admin: every quotation
// scope = [ids] -> other users: only their own company's quotations
// scope left out -> nothing (so a forgotten argument can never leak data)
export const getAllQuotations = async (scope = []) => {
  const result = await pool.query(
    'SELECT * FROM quotations WHERE deleted_at IS NULL AND ($1::int[] IS NULL OR company_id = ANY($1)) ORDER BY created_at DESC',
    [scope]
  );
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

  const yearToUse = resets ? currentYear : s.quotation_current_year;
  const prefix = (s.quotation_prefix || 'QT').trim().replace(/-+$/, '');
  const len = Math.max(1, Number(s.quotation_number_length) || 4);

  const formatNumber = (seq) => {
    const seqStr = String(seq).padStart(len, '0');
    return resets ? `${prefix}-${yearToUse}-${seqStr}` : `${prefix}-${seqStr}`;
  };

  let nextSeq = yearChanged ? 1 : (Number(s.quotation_current_sequence) || 0) + 1;

  // Skip numbers already in use (all companies, including trashed quotations)
  while (true) {
    const { rowCount } = await client.query(
      'SELECT 1 FROM quotations WHERE quotation_number = $1',
      [formatNumber(nextSeq)]
    );
    if (rowCount === 0) break;
    nextSeq += 1;
  }

  await client.query(
    `UPDATE invoice_settings
     SET quotation_current_sequence = $1, quotation_current_year = $2, updated_at = NOW()
     WHERE id = 1`,
    [nextSeq, yearToUse]
  );

  return formatNumber(nextSeq);
};

export const saveQuotation = async (q, isNew, byAi = false, scope = [], ownCompanyId = null, creator = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const id = q.id;
    if (!id) throw new Error('Missing quotation id');

    let status = q.status;
    // The AI asked for "Sent": save as Draft first, then run the real send flow below
    const aiWantsSend = byAi && q.status === 'Sent';
    // Any status beyond "Draft" needs an official quotation number; if there
    // isn't one yet, force back to Draft.
    if (status && status !== 'Draft') {
      const { rows: existingRows } = await client.query(
        'SELECT quotation_number FROM quotations WHERE id = $1',
        [id]
      );
      if (!existingRows[0]?.quotation_number) {
        status = 'Draft';
      }
    }

    // ── Activity log: decided by the server, never trusted from the browser ──
    const { rows: prevRows } = await client.query(
      'SELECT status, activity_log FROM quotations WHERE id = $1 FOR UPDATE',
      [id]
    );
    const prev = prevRows[0];
    const prevLog = Array.isArray(prev?.activity_log) ? prev.activity_log : [];
    const by = byAi ? ' by Nexa AI' : '';
    let logMessage;
    if (!prev) logMessage = `Quotation created${by}`;
    else if (status && status !== prev.status)
      logMessage = status === 'Approved' ? `Quotation approved${by}` : `Status changed to ${status}${by}`;
    else logMessage = `Quotation edited${by}`;
    const activityLog = [...prevLog, { message: logMessage, date: new Date().toISOString() }];

    const result = await client.query(
      `INSERT INTO quotations (
        id, name, company, email, phone, date, valid_until, status, amount,
        timeline, description, scope_of_work, deliverables, technology_used,
        timeline_desc, project_cost, payment_terms, terms, notes, items,
        custom_sections, signature,
        accent_color, accent_bg, issuer_name, issuer_address, issuer_phone,
        issuer_email, issuer_contact, project_title, client_address, logo,
        template_style, cost_items, include_gst, gst_percent, gst_mode, activity_log,
        company_id, created_by, created_by_name, created_via, salutation
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$41,$42,$43,$44
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
        activity_log=$38, salutation=$44,
        deleted_at=NULL, updated_at=NOW()
      WHERE ($40::int[] IS NULL OR quotations.company_id = ANY($40))
      RETURNING *`,
      [
        id, q.name, q.company, q.email, q.phone, q.date, q.validUntil,
        status, q.amount, q.timeline, q.description, q.scopeOfWork,
        q.deliverables, q.technologyUsed, q.timelineDesc, q.projectCost,
        q.paymentTerms, q.terms, q.notes,
        JSON.stringify(q.items), JSON.stringify(q.customSections || []), q.signature,
        q.accentColor, q.accentBg, q.issuerName, q.issuerAddress, q.issuerPhone,
        q.issuerEmail, q.issuerContact, q.projectTitle, q.clientAddress, q.logo,
        q.templateStyle, JSON.stringify(q.costItems || []), q.includeGst !== false, q.gstPercent ?? 18,
        q.gstMode || (q.includeGst === false ? 'without' : 'with'),
        JSON.stringify(activityLog),
        ownCompanyId,   // $39 - new quotations are saved under this company
        scope,          // $40 - which existing quotations this user may overwrite
        creator.id != null ? String(creator.id) : null,  // $41 - created_by (INSERT only)
        creator.name || null,                            // $42 - created_by_name
        byAi ? 'ai' : null,                              // $43 - created_via
        q.salutation || '',                              // $44 - salutation
      ]
    );

    // The row belongs to another company: nothing was saved
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('COMMIT');

    // Assign the official number and set status to Sent via the proper path
    if (aiWantsSend && !result.rows[0].quotation_number) {
      const sent = await sendQuotation(id, scope);
      return sent || result.rows[0];
    }
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// The only place an official QT-xxxx number is ever assigned. Locks the
// row first so a double-click can't race with itself; idempotent if it's
// already been sent.
export const sendQuotation = async (id, scope = []) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, quotation_number FROM quotations
       WHERE id = $2 AND deleted_at IS NULL AND ($1::int[] IS NULL OR company_id = ANY($1)) FOR UPDATE`,
      [scope, id]
    );
    const existing = rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return null;
    }

    if (existing.quotation_number) {
      await client.query('COMMIT');
      const already = await pool.query('SELECT * FROM quotations WHERE id = $1', [id]);
      return already.rows[0];
    }

    const quotationNumber = await reserveNextQuotationNumber(client);

    const result = await client.query(
      `UPDATE quotations
       SET quotation_number = $1, status = 'Sent', sent_at = NOW(),
           activity_log = COALESCE(activity_log, '[]'::jsonb) || $3::jsonb
       WHERE id = $2
       RETURNING *`,
      [
        quotationNumber,
        id,
        JSON.stringify([{ message: `Quotation sent to customer (${quotationNumber})`, date: new Date().toISOString() }]),
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

// Appends one line to a quotation's activity log (used e.g. when an invoice is created from it)
export const addQuotationActivity = async (id, message) => {
  if (!id) return;
  await pool.query(
    `UPDATE quotations
     SET activity_log = COALESCE(activity_log, '[]'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [id, JSON.stringify([{ message, date: new Date().toISOString() }])]
  );
};

export const deleteQuotation = async (id, scope = []) => {
  await pool.query(
    'UPDATE quotations SET deleted_at = NOW() WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1))',
    [scope, id]
  );
};

export const getTrashedQuotations = async (scope = []) => {
  const result = await pool.query(
    'SELECT * FROM quotations WHERE deleted_at IS NOT NULL AND ($1::int[] IS NULL OR company_id = ANY($1)) ORDER BY deleted_at DESC',
    [scope]
  );
  return result.rows;
};

export const restoreQuotation = async (id, scope = []) => {
  const result = await pool.query(
    'UPDATE quotations SET deleted_at = NULL WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1)) RETURNING *',
    [scope, id]
  );
  return result.rows[0];
};

export const permanentlyDeleteQuotation = async (id, scope = []) => {
  await pool.query(
    'DELETE FROM quotations WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1))',
    [scope, id]
  );
};

export const purgeOldTrashedQuotations = async () => {
  await pool.query(`DELETE FROM quotations WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`);
};