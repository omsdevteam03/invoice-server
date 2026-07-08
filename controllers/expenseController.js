import { getAllExpenses, saveExpense, deleteExpense } from '../models/expenseModel.js';

export const getExpenses = async (req, reply) => {
  try {
    const rows = await getAllExpenses();
    const expenses = rows.map(e => ({
      id: e.id,
      title: e.title,
      category: e.category,
      amount: Number(e.amount),
      date: e.date,
      note: e.note,
    }));
    return reply.send(expenses);
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const upsertExpense = async (req, reply) => {
  try {
    const saved = await saveExpense(req.body);
    return reply.send(saved);
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const removeExpense = async (req, reply) => {
  try {
    await deleteExpense(req.params.id);
    return reply.send({ message: 'Deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};