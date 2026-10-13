import { getProducts, upsertProduct, removeProduct } from '../controllers/productController.js';

export default async function productRoutes(fastify) {
  fastify.get('/', getProducts);
  fastify.post('/', upsertProduct);
  fastify.delete('/:id', removeProduct);
}