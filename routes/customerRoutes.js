import { getCustomers, upsertCustomer, removeCustomer } from '../controllers/customerController.js';

export default async function customerRoutes(fastify) {
  fastify.get('/', getCustomers);
  fastify.post('/', upsertCustomer);
  fastify.delete('/:id', removeCustomer);
}