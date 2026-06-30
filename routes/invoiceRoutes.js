import { getInvoices, upsertInvoice, removeInvoice } from '../controllers/invoiceController.js';

export default async function invoiceRoutes(fastify) {
  fastify.get('/', getInvoices);
  fastify.post('/', upsertInvoice);
  fastify.delete('/:id', removeInvoice);
}