import bcrypt from 'bcryptjs';
import {
  getCompanySettings,
  saveCompanySettingsRow,
  getInvoiceSettings,
  saveInvoiceSettingsRow,
  getAdminProfile,
  saveAdminProfileRow,
  getPasswordHash,
  updatePasswordHash,
  getNotificationSettings,
  saveNotificationSettingsRow,
} from '../models/settingsModel.js';

// ── row -> camelCase mappers ──
const mapCompany = (row) => ({
  companyName: row.company_name,
  companyEmail: row.company_email,
  companyPhone: row.company_phone,
  companyAddress: row.company_address,
  gstin: row.gstin,
  website: row.website,
  logo: row.logo,
});

const mapInvoice = (row) => ({
  invoicePrefix: row.invoice_prefix,
  quotationPrefix: row.quotation_prefix,
  proformaPrefix: row.proforma_prefix,
  gstPercent: row.gst_percent,
  currency: row.currency,
  defaultPaymentTerms: row.default_payment_terms,
  defaultNotes: row.default_notes,
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

// ── GET /api/settings/company ──
export const getCompany = async (req, reply) => {
  try {
    const row = await getCompanySettings();
    if (!row) return reply.status(404).send({ message: 'Company settings not found' });
    return reply.send(mapCompany(row));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ── PUT /api/settings/company ──
export const updateCompany = async (req, reply) => {
  try {
    const saved = await saveCompanySettingsRow(req.body);
    return reply.send(mapCompany(saved));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ── GET /api/settings/invoice ──
export const getInvoice = async (req, reply) => {
  try {
    const row = await getInvoiceSettings();
    if (!row) return reply.status(404).send({ message: 'Invoice settings not found' });
    return reply.send(mapInvoice(row));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ── PUT /api/settings/invoice ──
export const updateInvoice = async (req, reply) => {
  try {
    const saved = await saveInvoiceSettingsRow(req.body);
    return reply.send(mapInvoice(saved));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ── GET /api/settings/profile ──
export const getProfile = async (req, reply) => {
  try {
    const row = await getAdminProfile();
    if (!row) return reply.status(404).send({ message: 'Profile not found' });
    return reply.send(mapProfile(row));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ── PUT /api/settings/profile ──
export const updateProfile = async (req, reply) => {
  try {
    const saved = await saveAdminProfileRow(req.body);
    return reply.send(mapProfile(saved));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ── POST /api/settings/profile/password ──
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

// ── GET /api/settings/notifications ──
export const getNotifications = async (req, reply) => {
  try {
    const row = await getNotificationSettings();
    if (!row) return reply.status(404).send({ message: 'Notification settings not found' });
    return reply.send(mapNotifications(row));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ── PUT /api/settings/notifications ──
export const updateNotifications = async (req, reply) => {
  try {
    const saved = await saveNotificationSettingsRow(req.body);
    return reply.send(mapNotifications(saved));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};