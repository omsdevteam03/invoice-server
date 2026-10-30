import { getProducts, upsertProduct, removeProduct, listMovements, adjust, clearHistory } from '../controllers/productController.js';

export default async function productRoutes(fastify) {
  fastify.get('/', getProducts);
  fastify.post('/', upsertProduct);
  fastify.get('/movements', listMovements);
  fastify.post('/adjust', adjust);
  fastify.delete('/movements', clearHistory);
  fastify.delete('/:id', removeProduct);
}