import pool from '../config/db.js';
import { getAllInvoices, saveInvoice, deleteInvoice } from '../models/invoiceModel.js';

export const getInvoices = async (req, reply) => {
  try {
    const rows = await getAllInvoices();
    const invoices = rows.map(inv => ({
      id: inv.id,
      invoiceNo: inv.invoice_no,
      buyerName: inv.buyer_name,
      buyerAddress: inv.buyer_address,
      buyerMobile: inv.buyer_mobile,
      buyerGSTIN: inv.buyer_gstin,
      date: inv.date,
      dueDate: inv.due_date,
      status: inv.status,
      gstType: inv.gst_type,
      items: inv.items,
      amountPaid: Number(inv.amount_paid || 0),
      total: Number(inv.total),
      amountDue: Number(inv.amount_due),
      notes: inv.notes,
      signature: inv.signature,
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

    // Return the saved invoice in the same shape the frontend expects
    return reply.send({
      id: saved.id,
      invoiceNo: saved.invoice_no,
      buyerName: saved.buyer_name,
      buyerAddress: saved.buyer_address,
      buyerMobile: saved.buyer_mobile,
      buyerGSTIN: saved.buyer_gstin,
      date: saved.date,
      dueDate: saved.due_date,
      status: saved.status,
      gstType: saved.gst_type,
      items: saved.items,
      amountPaid: Number(saved.amount_paid || 0),
      total: Number(saved.total),
      amountDue: Number(saved.amount_due),
      notes: saved.notes,
      signature: saved.signature,
    });
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

