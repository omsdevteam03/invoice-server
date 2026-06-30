import { login } from '../controllers/authController.js';

export default async function authRoutes(fastify) {
  fastify.post('/login', login);
}