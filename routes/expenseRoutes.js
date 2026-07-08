import { getExpenses, upsertExpense, removeExpense } from '../controllers/expenseController.js';

export default async function expenseRoutes(fastify) {
  fastify.get('/', getExpenses);
  fastify.post('/', upsertExpense);
  fastify.delete('/:id', removeExpense);
}