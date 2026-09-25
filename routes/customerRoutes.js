import {
  getCustomers, upsertCustomer, removeCustomer,
  getTrash, restoreFromTrash, deletePermanently,
} from '../controllers/customerController.js';

export default async function customerRoutes(fastify) {
  fastify.get('/', getCustomers);
  fastify.post('/', upsertCustomer);
  fastify.delete('/:id', removeCustomer);

  fastify.get('/trash', getTrash);
  fastify.post('/:id/restore', restoreFromTrash);
  fastify.delete('/:id/permanent', deletePermanently);
}