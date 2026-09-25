import bcrypt from 'bcryptjs';
import fs from 'fs';
import {
  getCompanySettings,
  getCompanySettingsById,
  listCompanySettings,
  createCompanySettingsRow,
  saveCompanySettingsRowById,
  activateCompanySettingsRow,
  deleteCompanySettingsRow,
  getInvoiceSettings,
  saveInvoiceSettingsRow,
  resetQuotationNumberingRow,
  getAdminProfile,
  saveAdminProfileRow,
  getPasswordHash,
  updatePasswordHash,
  getNotificationSettings,
  saveNotificationSettingsRow,
  getBackupStats,
  listBackups,
  getBackupById,
  deleteBackupRecord,
  getBackupSettings,
  saveBackupSettings,
  createBackupFile,
  getBackupFilePath,
  backupFileExists,
  validateBackupBuffer,
  restoreFromData,
} from '../models/settingsModel.js';

const mapCompany = (row) => ({
  id: row.id,
  companyName: row.company_name,
  companyEmail: row.company_email,
  companyPhone: row.company_phone,
  companyAddress: row.company_address,
  gstin: row.gstin,
  website: row.website,
  logo: row.logo,
  status: row.status,
});

const mapInvoice = (row) => ({
  invoicePrefix: row.invoice_prefix,
  quotationPrefix: row.quotation_prefix,
  proformaPrefix: row.proforma_prefix,
  gstPercent: row.gst_percent,
  currency: row.currency,
  defaultPaymentTerms: row.default_payment_terms,
  defaultNotes: row.default_notes,
  quotationNumberLength: row.quotation_number_length,
  quotationYearlyReset: row.quotation_yearly_reset,
  quotationCurrentSequence: row.quotation_current_sequence,
  quotationCurrentYear: row.quotation_current_year,
});

const mapProfile = (row) => ({
  adminName: row.admin_name,
  adminEmail: row.admin_email,
});

const mapNotifications = (row) => ({
  notifyOnInvoice: row.notify_on_invoice,
  notifyOnQuotation: row.notify_on_quotation,
  notifyOnPayment: row.notify_on_payment,
});

const mapBackup = (row) => ({
  id: row.id,
  name: row.display_name,
  createdAt: row.created_at,
  fileSize: Number(row.file_size),
  status: row.status,
  type: row.type,
  counts: {
    customers: row.customers_count,
    quotations: row.quotations_count,
    invoices: row.invoices_count,
  },
});

const mapBackupSettings = (row) => ({
  autoBackupEnabled: row.auto_backup_enabled,
  frequency: row.frequency,
  lastRunAt: row.last_run_at,
  nextRunAt: row.next_run_at,
});

// ── Company: single "active" profile (legacy route, still used by
// anything that just wants "the current company", e.g. PDF headers) ──

export const getCompany = async (req, reply) => {
  try {
    const row = await getCompanySettings();
    if (!row) return reply.status(404).send({ message: 'Company settings not found' });
    return reply.send(mapCompany(row));
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const updateCompany = async (req, reply) => {
  try {
    const active = await getCompanySettings();
    if (!active) return reply.status(404).send({ message: 'No active company profile found' });
    const saved = await saveCompanySettingsRowById(active.id, req.body);
    return reply.send(mapCompany(saved));
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ── Company: multi-profile management ──

export const listCompanies = async (req, reply) => {
  try {
    const rows = await listCompanySettings();
    return reply.send(rows.map(mapCompany));
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const createCompany = async (req, reply) => {
  try {
    const saved = await createCompanySettingsRow(req.body);
    return reply.status(201).send(mapCompany(saved));
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const updateCompanyById = async (req, reply) => {
  try {
    const { id } = req.params;
    const existing = await getCompanySettingsById(id);
    if (!existing) return reply.status(404).send({ message: 'Company profile not found' });
    const saved = await saveCompanySettingsRowById(id, req.body);
    return reply.send(mapCompany(saved));
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const activateCompany = async (req, reply) => {
  try {
    const { id } = req.params;
    const saved = await activateCompanySettingsRow(id);
    if (!saved) return reply.status(404).send({ message: 'Company profile not found' });
    return reply.send(mapCompany(saved));
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const deleteCompany = async (req, reply) => {
  try {
    const { id } = req.params;
    const deleted = await deleteCompanySettingsRow(id);
    if (!deleted) {
      return reply.status(400).send({
        message: 'Only draft profiles can be deleted. Activate a different profile first, or the profile was not found.',
      });
    }
    return reply.send({ message: 'Company profile deleted' });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const getInvoice = async (req, reply) => {
  try {
    const row = await getInvoiceSettings();
    if (!row) return reply.status(404).send({ message: 'Invoice settings not found' });
    return reply.send(mapInvoice(row));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const updateInvoice = async (req, reply) => {
  try {
    const saved = await saveInvoiceSettingsRow(req.body);
    return reply.send(mapInvoice(saved));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const resetQuotationNumbering = async (req, reply) => {
  try {
    const saved = await resetQuotationNumberingRow();
    if (!saved) return reply.status(404).send({ message: 'Invoice settings not found' });
    return reply.send(mapInvoice(saved));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const getProfile = async (req, reply) => {
  try {
    const row = await getAdminProfile();
    if (!row) return reply.status(404).send({ message: 'Profile not found' });
    return reply.send(mapProfile(row));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const updateProfile = async (req, reply) => {
  try {
    const saved = await saveAdminProfileRow(req.body);
    return reply.send(mapProfile(saved));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const changePassword = async (req, reply) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return reply.status(400).send({ message: 'Password must be at least 6 characters.' });
    }

    const existingHash = await getPasswordHash();
    if (existingHash) {
      const valid = await bcrypt.compare(currentPassword || '', existingHash);
      if (!valid) return reply.status(401).send({ message: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await updatePasswordHash(newHash);
    return reply.send({ message: 'Password updated' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const getNotifications = async (req, reply) => {
  try {
    const row = await getNotificationSettings();
    if (!row) return reply.status(404).send({ message: 'Notification settings not found' });
    return reply.send(mapNotifications(row));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const updateNotifications = async (req, reply) => {
  try {
    const saved = await saveNotificationSettingsRow(req.body);
    return reply.send(mapNotifications(saved));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ════════════════════════════════════════════════════════════════
// ── Backup & Restore ──
// ════════════════════════════════════════════════════════════════

export const getBackupStatsHandler = async (req, reply) => {
  try {
    const stats = await getBackupStats();
    return reply.send({
      lastBackupAt: stats.lastBackupAt,
      lastBackupStatus: stats.lastBackupAt ? stats.lastBackupStatus : 'never',
      dbSizeBytes: stats.dbSizeBytes,
      totalCustomers: stats.totalCustomers,
      totalQuotations: stats.totalQuotations,
      totalInvoices: stats.totalInvoices,
    });
  } catch (err) {
    return reply.status(500).send({ message: 'Failed to load backup stats', error: err.message });
  }
};

export const getBackupHistory = async (req, reply) => {
  try {
    const rows = await listBackups();
    return reply.send(rows.map(mapBackup));
  } catch (err) {
    return reply.status(500).send({ message: 'Failed to load backup history', error: err.message });
  }
};

export const createBackup = async (req, reply) => {
  try {
    const record = await createBackupFile('manual');
    return reply.status(201).send(mapBackup(record));
  } catch (err) {
    return reply.status(500).send({ message: 'Backup failed. Please try again.', error: err.message });
  }
};

export const downloadBackup = async (req, reply) => {
  try {
    const { id } = req.params;
    const row = await getBackupById(id);
    if (!row) return reply.status(404).send({ message: 'Backup not found' });
    if (!backupFileExists(row.file_name)) {
      return reply.status(404).send({ message: 'Backup file is missing from storage' });
    }

    const filePath = getBackupFilePath(row.file_name);
    const stream = fs.createReadStream(filePath);
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${row.file_name}"`);
    return reply.send(stream);
  } catch (err) {
    return reply.status(500).send({ message: 'Download failed', error: err.message });
  }
};

export const deleteBackup = async (req, reply) => {
  try {
    const { id } = req.params;
    const row = await deleteBackupRecord(id);
    if (!row) return reply.status(404).send({ message: 'Backup not found' });
    return reply.send({ message: 'Backup deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Failed to delete backup', error: err.message });
  }
};

export const restoreBackup = async (req, reply) => {
  try {
    const file = await req.file();
    if (!file) return reply.status(400).send({ message: 'No backup file was uploaded.' });

    const buffer = await file.toBuffer();
    const { valid, reason, data } = await validateBackupBuffer(buffer);

    if (!valid) {
      return reply.status(400).send({ message: reason || 'Invalid backup file.' });
    }

    await restoreFromData(data);
    return reply.send({ message: 'Restore completed successfully.' });
  } catch (err) {
        req.log.error(err);
    return reply.status(500).send({ message: 'Restore failed. Your existing data was not modified.', error: err.message });
  }
};

export const getBackupSettingsHandler = async (req, reply) => {
  try {
    const row = await getBackupSettings();
    return reply.send(mapBackupSettings(row));
  } catch (err) {
    return reply.status(500).send({ message: 'Failed to load auto-backup settings', error: err.message });
  }
};

export const updateBackupSettings = async (req, reply) => {
  try {
    const { autoBackupEnabled, frequency } = req.body;
    if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
      return reply.status(400).send({ message: 'Invalid frequency' });
    }
    const row = await saveBackupSettings({ autoBackupEnabled: Boolean(autoBackupEnabled), frequency });
    return reply.send(mapBackupSettings(row));
  } catch (err) {
    return reply.status(500).send({ message: 'Failed to save auto-backup settings', error: err.message });
  }
};