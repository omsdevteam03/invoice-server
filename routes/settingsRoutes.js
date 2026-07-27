import {
  getCompany,
  updateCompany,
  getInvoice,
  updateInvoice,
  getProfile,
  updateProfile,
  changePassword,
  getNotifications,
  updateNotifications,
} from '../controllers/settingsController.js';

export default async function settingsRoutes(fastify) {
  fastify.get('/company', getCompany);
  fastify.put('/company', updateCompany);

  fastify.get('/invoice', getInvoice);
  fastify.put('/invoice', updateInvoice);

  fastify.get('/profile', getProfile);
  fastify.put('/profile', updateProfile);
  fastify.post('/profile/password', changePassword);

  fastify.get('/notifications', getNotifications);
  fastify.put('/notifications', updateNotifications);
}