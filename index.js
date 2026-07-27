import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import db from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import quotationRoutes from './routes/quotationRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Routes
fastify.register(authRoutes, { prefix: '/api/auth' });
fastify.register(quotationRoutes, { prefix: '/api/quotations' });
fastify.register(invoiceRoutes, { prefix: '/api/invoices' });
fastify.register(customerRoutes, { prefix: '/api/customers' });
fastify.register(expenseRoutes, { prefix: '/api/expenses' });
fastify.register(settingsRoutes, { prefix: '/api/settings' });

// Root
fastify.get('/', async () => ({ message: 'Server is running!' }));

// Health check
fastify.get('/api/health', async (request, reply) => {
  try {
    await db.query('SELECT 1');
    return reply.send({
      status: 'OK',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: 'connected',
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (err) {
    return reply.status(503).send({
      status: 'ERROR',
      database: 'disconnected',
      message: err.message,
    });
  }
});

// Start
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`Server running on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}