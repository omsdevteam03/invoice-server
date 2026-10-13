// routes/usersRoutes.js — the ONLY backend file with imports for this feature.
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../config/db.js';
import { createUsersModel } from '../models/usersModel.js';
import { createUsersController } from '../controllers/usersController.js';

const model = createUsersModel(db);
const controller = createUsersController({ model, bcrypt });

// ASSUMPTION: your login signs a JWT with process.env.JWT_SECRET and puts the user id
// in `id` (or `userId`). If authRoutes.js does it differently, change only this hook.
const authenticate = async (request, reply) => {
  try {
    const token = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await model.findById(payload.id ?? payload.userId);
    if (!user || user.status !== 'Active') {
      return reply.status(401).send({ message: 'Your session is no longer valid. Please sign in again.' });
    }
    request.user = user; // { id, fullName, email, role, status, companyIds }
  } catch (err) {
    request.log.error(err); // shows the real reason in the server terminal
    return reply.status(401).send({ message: 'Please sign in to continue.' });
  }
};

const adminOnly = async (request, reply) => {
  if (request.user.role !== 'Admin') {
    return reply.status(403).send({ message: 'Only Admins can manage users.' });
  }
};

export default async function usersRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', adminOnly);

  fastify.get('/', controller.list);
  fastify.get('/companies', controller.companies); // used by the Add/Edit User company checkboxes
  fastify.get('/limit', controller.limit);
  fastify.put('/limit', controller.setLimit);
  fastify.post('/', controller.create);
  fastify.put('/:id', controller.update);
  fastify.patch('/:id/status', controller.setStatus);
  fastify.delete('/:id', controller.remove);
}