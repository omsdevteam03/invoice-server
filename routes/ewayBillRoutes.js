import { createEwayBill, updateVehicle, cancelEway } from '../controllers/ewayBillController.js';

export default async function ewayBillRoutes(fastify) {
  fastify.post('/generate', createEwayBill);
  fastify.post('/vehicle', updateVehicle);
  fastify.post('/cancel', cancelEway);
}