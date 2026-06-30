import { getQuotations, upsertQuotation, removeQuotation } from '../controllers/quotationController.js';

export default async function quotationRoutes(fastify) {
  fastify.get('/', getQuotations);
  fastify.post('/', upsertQuotation);
  fastify.delete('/:id', removeQuotation);
}