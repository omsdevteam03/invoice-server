import {
  getCompany,
  updateCompany,
  listCompanies,
  createCompany,
  updateCompanyById,
  activateCompany,
  deleteCompany,
  getInvoice,
  updateInvoice,
  getProfile,
  updateProfile,
  changePassword,
  getNotifications,
  updateNotifications,
  resetQuotationNumbering,
  getBackupStatsHandler,
  getBackupHistory,
  createBackup,
  downloadBackup,
  deleteBackup,
  restoreBackup,
  getBackupSettingsHandler,
  updateBackupSettings,
} from '../controllers/settingsController.js';
import { adminOnly } from '../middleware/auth.js';

const admin = { preHandler: adminOnly };

export default async function settingsRoutes(fastify) {
  // Legacy single-profile routes — still resolve to whichever profile is
  // currently marked "active", so anything else in the app reading "the"
  // company (invoice/quotation PDFs, etc.) keeps working unchanged.
  fastify.get('/company', getCompany);
  fastify.put('/company', admin, updateCompany);

  // Multi-profile management
  fastify.get('/companies', listCompanies);
  fastify.post('/companies', admin, createCompany);
  fastify.put('/companies/:id', admin, updateCompanyById);
  fastify.put('/companies/:id/activate', admin, activateCompany);
  fastify.delete('/companies/:id', admin, deleteCompany);

  fastify.get('/invoice', getInvoice);
  fastify.put('/invoice', admin, updateInvoice);
  fastify.post('/invoice/reset-quotation-numbering', admin, resetQuotationNumbering);

  fastify.get('/profile', getProfile);
  fastify.put('/profile', updateProfile);
  fastify.post('/profile/password', changePassword);

  fastify.get('/notifications', getNotifications);
  fastify.put('/notifications', updateNotifications);

   fastify.get('/backups/stats', admin, getBackupStatsHandler);
  fastify.get('/backups', admin, getBackupHistory);
  fastify.post('/backups/create', admin, createBackup);
  fastify.get('/backups/:id/download', admin, downloadBackup);
  fastify.delete('/backups/:id', admin, deleteBackup);
  fastify.post('/backups/restore', admin, restoreBackup);
  fastify.get('/backups/settings', admin, getBackupSettingsHandler);
  fastify.put('/backups/settings', admin, updateBackupSettings);
}