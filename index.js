import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import db from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import quotationRoutes from './routes/quotationRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import cron from 'node-cron';
import { getBackupSettings, markBackupRun, createBackupFile } from './models/settingsModel.js';
import chatRoutes from "./routes/chatRoutes.js";
import usersRoutes from './routes/usersRoutes.js';
import { authenticate } from './middleware/auth.js';
import { purgeOldTrashedCustomers } from './models/customerModel.js';
import { purgeOldTrashedInvoices } from './models/invoiceModel.js';
import { purgeOldTrashedQuotations } from './models/quotationModel.js';

const fastify = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 }); // 10MB — up from Fastify's 1MB default, needed for base64 image messages in chat
await fastify.register(cors, {
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
});

// Multipart support — required for file uploads (e.g. backup restore)
await fastify.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max upload size, adjust if your backups can be larger
  },
});

// Routes
fastify.register(authRoutes, { prefix: '/api/auth' });      // public (login)
fastify.register(usersRoutes, { prefix: '/api/users' });    // has its own Admin check

// Everything below requires a logged-in user
fastify.register(async (app) => {
  app.addHook('preHandler', authenticate);
  app.register(quotationRoutes, { prefix: '/api/quotations' });
  app.register(invoiceRoutes, { prefix: '/api/invoices' });
  app.register(customerRoutes, { prefix: '/api/customers' });
  app.register(expenseRoutes, { prefix: '/api/expenses' });
  app.register(settingsRoutes, { prefix: '/api/settings' });
  app.register(chatRoutes, { prefix: '/api/chat' });
});
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

// ── Automatic backup scheduler ──
// Checks every hour whether a scheduled backup is due, based on the
// Automatic Backup toggle in Settings, and creates one if so.
const FREQUENCY_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

cron.schedule('0 * * * *', async () => {
  try {
    const settings = await getBackupSettings();
    if (!settings || !settings.auto_backup_enabled) return;

    const now = new Date();
    const due = !settings.next_run_at || new Date(settings.next_run_at) <= now;
    if (!due) return;

    fastify.log.info('Running scheduled automatic backup...');
    await createBackupFile('automatic');

    const intervalMs = FREQUENCY_MS[settings.frequency] || FREQUENCY_MS.daily;
    await markBackupRun(new Date(Date.now() + intervalMs));
  } catch (err) {
    fastify.log.error({ err }, 'Automatic backup failed');
  }
});
// Runs once a day at midnight — permanently removes anything sitting in
// trash for more than 30 days
cron.schedule('0 0 * * *', async () => {
  try {
    await purgeOldTrashedCustomers();
    await purgeOldTrashedInvoices();
    await purgeOldTrashedQuotations();
    fastify.log.info('Trash purge complete');
  } catch (err) {
    fastify.log.error({ err }, 'Trash purge failed');
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