import Fastify from 'fastify';
import cors from '@fastify/cors';
import db from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import quotationRoutes from './routes/quotationRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import customerRoutes from './routes/customerRoutes.js';

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

fastify.register(authRoutes, { prefix: '/api/auth' });
fastify.register(quotationRoutes, { prefix: '/api/quotations' });
fastify.register(invoiceRoutes, { prefix: '/api/invoices' });

fastify.get('/', async () => ({ message: 'Server is running!' }));
fastify.register(customerRoutes, { prefix: '/api/customers' });

try {
  await fastify.listen({ port: 3000 });
  console.log('Server running on http://localhost:3000');
} catch (err) {
  console.error(err);
  process.exit(1);
}