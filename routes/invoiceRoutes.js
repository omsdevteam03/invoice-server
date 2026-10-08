import {
  getInvoices, getInvoice, upsertInvoice, removeInvoice,
  getTrash, restoreFromTrash, deletePermanently,
} from '../controllers/invoiceController.js';

export default async function invoiceRoutes(fastify) {
  fastify.get('/', getInvoices);
  fastify.get('/:id', getInvoice);
  fastify.post('/', upsertInvoice);
  fastify.delete('/:id', removeInvoice);

  fastify.get('/trash', getTrash);
  fastify.post('/:id/restore', restoreFromTrash);
  fastify.delete('/:id/permanent', deletePermanently);
}