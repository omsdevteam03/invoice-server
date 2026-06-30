import pool from '../config/db.js';
import { getAllInvoices, saveInvoice, deleteInvoice } from '../models/invoiceModel.js';

export const getInvoices = async (req, reply) => {
  try {
    const rows = await getAllInvoices();
    const invoices = rows.map(inv => ({
      id: inv.id,
      buyerName: inv.buyer_name,
      company: inv.company,
      email: inv.email,
      phone: inv.phone,
      date: inv.date,
      dueDate: inv.due_date,
      status: inv.status,
      items: inv.items,
      tax: Number(inv.tax),
      discount: Number(inv.discount),
      total: Number(inv.total),
      amountDue: Number(inv.amount_due),
      notes: inv.notes,
    }));
    return reply.send(invoices);
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const upsertInvoice = async (req, reply) => {
  try {
    const saved = await saveInvoice(req.body);

    // ✅ Customer totalBilled update
    const buyerName = req.body.buyerName;
    const result = await pool.query(
      `SELECT total FROM invoices WHERE buyer_name = $1`,
      [buyerName]
    );
    const totalBilled = result.rows.reduce((sum, row) => sum + Number(row.total), 0);
    await pool.query(
      `UPDATE customers SET total_billed = $1 WHERE name = $2`,
      [totalBilled, buyerName]
    );

    return reply.send(saved);
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const removeInvoice = async (req, reply) => {
  try {
    await deleteInvoice(req.params.id);
    return reply.send({ message: 'Deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};