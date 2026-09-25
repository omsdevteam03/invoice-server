import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import pool from '../config/db.js';

// ── Company (multi-profile) ──
// company_settings now holds one row per company profile. Each row has a
// status of 'draft' or 'active'; exactly one row may be 'active' at a time
// (enforced by a partial unique index — see migration_add_company_profiles.sql).

// All saved profiles, oldest first (used for the picker/list in Settings).
export const listCompanySettings = async () => {
  const result = await pool.query(
    'SELECT * FROM company_settings ORDER BY created_at ASC, id ASC'
  );
  return result.rows;
};

// The single currently-active company profile. This is what the rest of
// the app (invoice/quotation PDFs, etc.) should keep using — its signature
// is unchanged, it just now resolves to whichever row is active instead of
// the old hardcoded id = 1.
export const getCompanySettings = async () => {
  const active = await pool.query("SELECT * FROM company_settings WHERE status = 'active' LIMIT 1");
  if (active.rows[0]) return active.rows[0];
  // Fallback for the (unexpected) case where nothing is marked active yet,
  // e.g. immediately after the migration runs on a table with no rows.
  const fallback = await pool.query('SELECT * FROM company_settings ORDER BY id ASC LIMIT 1');
  return fallback.rows[0];
};

export const getCompanySettingsById = async (id) => {
  const result = await pool.query('SELECT * FROM company_settings WHERE id = $1', [id]);
  return result.rows[0];
};

// Creates a new profile. Always starts as a draft — use
// activateCompanySettingsRow to promote it later.
export const createCompanySettingsRow = async (c) => {
  const result = await pool.query(`
    INSERT INTO company_settings (
      company_name, company_email, company_phone, company_address,
      gstin, website, logo, status, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',NOW(),NOW())
    RETURNING *`,
    [c.companyName, c.companyEmail, c.companyPhone, c.companyAddress, c.gstin, c.website, c.logo]
  );
  return result.rows[0];
};

// Updates an existing profile's fields. Does not touch status — use
// activateCompanySettingsRow to change which profile is active.
export const saveCompanySettingsRowById = async (id, c) => {
  const result = await pool.query(`
    UPDATE company_settings SET
      company_name = $1, company_email = $2, company_phone = $3,
      company_address = $4, gstin = $5, website = $6, logo = $7,
      updated_at = NOW()
    WHERE id = $8
    RETURNING *`,
    [c.companyName, c.companyEmail, c.companyPhone, c.companyAddress, c.gstin, c.website, c.logo, id]
  );
  return result.rows[0];
};

// Promotes one profile to 'active' and demotes whichever profile was
// previously active, in a single transaction so the "only one active row"
// constraint is never violated mid-flight.
export const activateCompanySettingsRow = async (id) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const target = await client.query('SELECT id FROM company_settings WHERE id = $1', [id]);
    if (!target.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      "UPDATE company_settings SET status = 'draft', updated_at = NOW() WHERE status = 'active' AND id != $1",
      [id]
    );
    const result = await client.query(
      "UPDATE company_settings SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *",
      [id]
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

// Drafts only — the active profile can't be deleted (demote or activate
// another profile first). Returns the deleted row, or undefined if the
// row didn't exist or was active.
export const deleteCompanySettingsRow = async (id) => {
  const result = await pool.query(
    "DELETE FROM company_settings WHERE id = $1 AND status != 'active' RETURNING *",
    [id]
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
      proforma_prefix = $7, quotation_number_length = $8, quotation_yearly_reset = $9,
      updated_at = NOW()
    WHERE id = 1
    RETURNING *`,
    [
      c.invoicePrefix, c.quotationPrefix, c.gstPercent, c.currency,
      c.defaultPaymentTerms, c.defaultNotes, c.proformaPrefix,
      Math.max(1, Number(c.quotationNumberLength) || 4),
      Boolean(c.quotationYearlyReset),
    ]
  );
  return result.rows[0];
};

// Resets quotation numbering back to zero — only call this when the
// quotations list is genuinely empty, since it does not touch or check
// existing quotation rows in any way.
export const resetQuotationNumberingRow = async () => {
  const result = await pool.query(`
    UPDATE invoice_settings
    SET quotation_current_sequence = 0,
        quotation_current_year = $1,
        updated_at = NOW()
    WHERE id = 1
    RETURNING *`,
    [new Date().getFullYear()]
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

// ════════════════════════════════════════════════════════════════
// ── Backup & Restore ──
// ════════════════════════════════════════════════════════════════

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = path.join(__dirname, '..', 'storage', 'backups');

const RESTORABLE_TABLES = ['customers', 'quotations', 'invoices'];

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

const ensureBackupDir = async () => {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
};

export const getBackupStats = async () => {
  const [dbSizeRes, customersRes, quotationsRes, invoicesRes, lastBackupRes] = await Promise.all([
    pool.query('SELECT pg_database_size(current_database()) AS size'),
    pool.query('SELECT COUNT(*)::int AS count FROM customers'),
    pool.query('SELECT COUNT(*)::int AS count FROM quotations'),
    pool.query('SELECT COUNT(*)::int AS count FROM invoices'),
    pool.query('SELECT * FROM backups ORDER BY created_at DESC LIMIT 1'),
  ]);

  const lastBackup = lastBackupRes.rows[0] || null;

  return {
    dbSizeBytes: Number(dbSizeRes.rows[0].size),
    totalCustomers: customersRes.rows[0].count,
    totalQuotations: quotationsRes.rows[0].count,
    totalInvoices: invoicesRes.rows[0].count,
    lastBackupAt: lastBackup ? lastBackup.created_at : null,
    lastBackupStatus: lastBackup ? lastBackup.status : 'never',
  };
};

export const listBackups = async () => {
  const result = await pool.query('SELECT * FROM backups ORDER BY created_at DESC');
  return result.rows;
};

export const getBackupById = async (id) => {
  const result = await pool.query('SELECT * FROM backups WHERE id = $1', [id]);
  return result.rows[0];
};

export const insertBackupRecord = async (rec) => {
  const result = await pool.query(
    `INSERT INTO backups (
      file_name, display_name, file_size, status, type,
      customers_count, quotations_count, invoices_count, error_message
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *`,
    [
      rec.fileName, rec.displayName, rec.fileSize, rec.status, rec.type,
      rec.customersCount || 0, rec.quotationsCount || 0, rec.invoicesCount || 0,
      rec.errorMessage || null,
    ]
  );
  return result.rows[0];
};

export const deleteBackupRecord = async (id) => {
  const row = await getBackupById(id);
  if (!row) return null;
  await pool.query('DELETE FROM backups WHERE id = $1', [id]);
  const filePath = path.join(BACKUP_DIR, row.file_name);
  await fs.rm(filePath, { force: true });
  return row;
};

export const getBackupSettings = async () => {
  const result = await pool.query('SELECT * FROM backup_settings WHERE id = 1');
  return result.rows[0];
};

export const saveBackupSettings = async ({ autoBackupEnabled, frequency }) => {
  const result = await pool.query(
    `UPDATE backup_settings SET
      auto_backup_enabled = $1, frequency = $2, updated_at = NOW()
    WHERE id = 1
    RETURNING *`,
    [autoBackupEnabled, frequency]
  );
  return result.rows[0];
};

export const markBackupRun = async (nextRunAt) => {
  await pool.query(
    `UPDATE backup_settings SET last_run_at = NOW(), next_run_at = $1 WHERE id = 1`,
    [nextRunAt]
  );
};

const gatherAllData = async () => {
  const [customers, quotations, invoices, company, invoiceSettings, profile, notifications] = await Promise.all([
    pool.query('SELECT * FROM customers ORDER BY created_at'),
    pool.query('SELECT * FROM quotations ORDER BY created_at'),
    pool.query('SELECT * FROM invoices ORDER BY created_at'),
    pool.query('SELECT * FROM company_settings ORDER BY id'),
    pool.query('SELECT * FROM invoice_settings WHERE id = 1'),
    pool.query('SELECT id, admin_name, admin_email FROM admin_profile WHERE id = 1'),
    pool.query('SELECT * FROM notification_settings WHERE id = 1'),
  ]);

  return {
    tables: {
      customers: customers.rows,
      quotations: quotations.rows,
      invoices: invoices.rows,
    },
    singletons: {
      // Note: company_settings can now hold multiple rows, so this is
      // exported/restored as a list rather than a single object.
      company_settings: company.rows.length ? company.rows : null,
      invoice_settings: invoiceSettings.rows[0] || null,
      admin_profile: profile.rows[0] || null,
      notification_settings: notifications.rows[0] || null,
    },
  };
};

export const createBackupFile = async (type = 'manual') => {
  await ensureBackupDir();

  const data = await gatherAllData();
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const displayName = `Backup_${timestamp}`;
  const fileName = `${displayName}.zip`;

  const meta = {
    version: 1,
    app: 'orangemedia-crm',
    exportedAt: now.toISOString(),
    tables: RESTORABLE_TABLES,
    counts: {
      customers: data.tables.customers.length,
      quotations: data.tables.quotations.length,
      invoices: data.tables.invoices.length,
    },
  };

  const zip = new JSZip();
  zip.file('meta.json', JSON.stringify(meta, null, 2));
  zip.file('data.json', JSON.stringify(data, null, 2));

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filePath = path.join(BACKUP_DIR, fileName);
  await fs.writeFile(filePath, buffer);

  const record = await insertBackupRecord({
    fileName,
    displayName,
    fileSize: buffer.length,
    status: 'success',
    type,
    customersCount: meta.counts.customers,
    quotationsCount: meta.counts.quotations,
    invoicesCount: meta.counts.invoices,
  });

  return record;
};

export const getBackupFilePath = (fileName) => path.join(BACKUP_DIR, fileName);

export const backupFileExists = (fileName) => fssync.existsSync(getBackupFilePath(fileName));

export const validateBackupBuffer = async (buffer) => {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const metaFile = zip.file('meta.json');
    const dataFile = zip.file('data.json');
    if (!metaFile || !dataFile) {
      return { valid: false, reason: 'This file is missing required backup contents.' };
    }

    const meta = JSON.parse(await metaFile.async('string'));
    const data = JSON.parse(await dataFile.async('string'));

    if (!meta || meta.app !== 'orangemedia-crm' || !Array.isArray(meta.tables)) {
      return { valid: false, reason: 'This file was not recognized as a valid CRM backup.' };
    }
    if (!data || typeof data !== 'object' || !data.tables) {
      return { valid: false, reason: 'The backup file appears to be corrupted.' };
    }

    return { valid: true, meta, data };
  } catch (err) {
    return { valid: false, reason: 'The backup file could not be read — it may be corrupted or not a .zip file.' };
  }
};

const sanitizeRowKeys = (row) => {
  const keys = Object.keys(row);
  for (const k of keys) {
    if (!SAFE_IDENTIFIER.test(k)) return null;
  }
  return keys;
};

const getColumnTypes = async (client, table) => {
  const result = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = $1`,
    [table]
  );
  const map = {};
  for (const row of result.rows) {
    map[row.column_name] = row.data_type; // e.g. 'ARRAY', 'jsonb', 'json', 'text', ...
  }
  return map;
};

const bulkReplaceTable = async (client, table, rows) => {
  if (!SAFE_IDENTIFIER.test(table)) throw new Error(`Unsafe table name in backup: ${table}`);
  await client.query(`DELETE FROM ${table}`);
  if (!Array.isArray(rows) || rows.length === 0) return;

  const columns = sanitizeRowKeys(rows[0]);
  if (!columns) throw new Error(`Backup file contains invalid column names for table ${table}`);

  const columnTypes = await getColumnTypes(client, table);

  for (const row of rows) {
    const values = columns.map((col) => {
      const v = row[col];
      if (v === null || v === undefined) return v;

      const type = columnTypes[col];

      // Native Postgres array column (e.g. text[]) — pass the JS array as-is,
      // the pg driver will serialize it correctly.
      if (type === 'ARRAY') {
        return v;
      }

      // jsonb/json columns — stringify.
      if ((type === 'jsonb' || type === 'json') && typeof v === 'object') {
        return JSON.stringify(v);
      }

      // Fallback: objects that aren't a recognized array/json column
      // (shouldn't normally happen, but keep old safe behavior).
      if (typeof v === 'object') {
        return JSON.stringify(v);
      }

      return v;
    });

    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );
  }
};

// Replaces every company profile with the ones from the backup, preserving
// each row's original id/status so the previously-active profile stays
// active after restore.
const restoreCompanySettings = async (client, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return;

  await client.query('DELETE FROM company_settings');
  for (const c of rows) {
    await client.query(
      `INSERT INTO company_settings (
        id, company_name, company_email, company_phone, company_address,
        gstin, website, logo, status, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, NOW()),NOW())`,
      [
        c.id, c.company_name, c.company_email, c.company_phone, c.company_address,
        c.gstin, c.website, c.logo, c.status || 'draft', c.created_at,
      ]
    );
  }
  // Keep the id sequence in sync after inserting explicit ids above.
  const seqName = await client.query("SELECT pg_get_serial_sequence('company_settings', 'id') AS seq");
  if (seqName.rows[0]?.seq) {
    await client.query(
      `SELECT setval($1, COALESCE((SELECT MAX(id) FROM company_settings), 1))`,
      [seqName.rows[0].seq]
    );
  }
};

export const restoreFromData = async (data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const table of RESTORABLE_TABLES) {
      await bulkReplaceTable(client, table, data.tables?.[table]);
    }

    const s = data.singletons || {};
    if (s.company_settings) {
      await restoreCompanySettings(client, s.company_settings);
    }
    if (s.invoice_settings) {
      const i = s.invoice_settings;
      await client.query(
        `UPDATE invoice_settings SET
          invoice_prefix=$1, quotation_prefix=$2, proforma_prefix=$3, gst_percent=$4,
          currency=$5, default_payment_terms=$6, default_notes=$7,
          quotation_number_length=$8, quotation_yearly_reset=$9,
          quotation_current_sequence=$10, quotation_current_year=$11, updated_at=NOW()
        WHERE id=1`,
        [
          i.invoice_prefix, i.quotation_prefix, i.proforma_prefix, i.gst_percent,
          i.currency, i.default_payment_terms, i.default_notes,
          i.quotation_number_length, i.quotation_yearly_reset,
          i.quotation_current_sequence, i.quotation_current_year,
        ]
      );
    }
    if (s.admin_profile) {
      await client.query(
        `UPDATE admin_profile SET admin_name=$1, admin_email=$2, updated_at=NOW() WHERE id=1`,
        [s.admin_profile.admin_name, s.admin_profile.admin_email]
      );
    }
    if (s.notification_settings) {
      const n = s.notification_settings;
      await client.query(
        `UPDATE notification_settings SET
          notify_on_invoice=$1, notify_on_quotation=$2, notify_on_payment=$3, updated_at=NOW()
        WHERE id=1`,
        [n.notify_on_invoice, n.notify_on_quotation, n.notify_on_payment]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};