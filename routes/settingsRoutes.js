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

export default async function settingsRoutes(fastify) {
  // Legacy single-profile routes — still resolve to whichever profile is
  // currently marked "active", so anything else in the app reading "the"
  // company (invoice/quotation PDFs, etc.) keeps working unchanged.
  fastify.get('/company', getCompany);
  fastify.put('/company', updateCompany);

  // Multi-profile management
  fastify.get('/companies', listCompanies);
  fastify.post('/companies', createCompany);
  fastify.put('/companies/:id', updateCompanyById);
  fastify.put('/companies/:id/activate', activateCompany);
  fastify.delete('/companies/:id', deleteCompany);

  fastify.get('/invoice', getInvoice);
  fastify.put('/invoice', updateInvoice);
  fastify.post('/invoice/reset-quotation-numbering', resetQuotationNumbering);

  fastify.get('/profile', getProfile);
  fastify.put('/profile', updateProfile);
  fastify.post('/profile/password', changePassword);

  fastify.get('/notifications', getNotifications);
  fastify.put('/notifications', updateNotifications);

  fastify.get('/backups/stats', getBackupStatsHandler);
  fastify.get('/backups', getBackupHistory);
  fastify.post('/backups/create', createBackup);
  fastify.get('/backups/:id/download', downloadBackup);
  fastify.delete('/backups/:id', deleteBackup);
  fastify.post('/backups/restore', restoreBackup);
  fastify.get('/backups/settings', getBackupSettingsHandler);
  fastify.put('/backups/settings', updateBackupSettings);
}