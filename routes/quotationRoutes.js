import {
  getQuotations, upsertQuotation, removeQuotation,
  getTrash, restoreFromTrash, deletePermanently,
} from '../controllers/quotationController.js';

export default async function quotationRoutes(fastify) {
  fastify.get('/', getQuotations);
  fastify.post('/', upsertQuotation);
  fastify.delete('/:id', removeQuotation);

  fastify.get('/trash', getTrash);
  fastify.post('/:id/restore', restoreFromTrash);
  fastify.delete('/:id/permanent', deletePermanently);
}