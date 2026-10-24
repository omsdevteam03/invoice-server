import pool from '../config/db.js';
import {
  getAllInvoices, getInvoiceById, saveInvoice, deleteInvoice,
  getTrashedInvoices, restoreInvoice, permanentlyDeleteInvoice,
} from '../models/invoiceModel.js';

const toInvoice = (inv) => ({
  id: inv.id,
  invoiceNo: inv.invoice_no,
  buyerSalutation: inv.buyer_salutation || '',
  buyerName: inv.buyer_name,
  buyerCompanyName: inv.buyer_company_name,
  buyerAddress: inv.buyer_address,
  buyerMobile: inv.buyer_mobile,
  buyerGSTIN: inv.buyer_gstin,
  date: inv.date,
  dueDate: inv.due_date,
  status: inv.status,
  gstType: inv.gst_type,
  gstPercent: Number(inv.gst_percent || 18),
  companyName: inv.company_name,
  companyAddress: inv.company_address,
  companyMobile: inv.company_mobile,
  companyEmail: inv.company_email,
  companyGSTIN: inv.company_gstin,
  items: inv.items,
  amountPaid: Number(inv.amount_paid || 0),
  total: Number(inv.total),
  amountDue: Number(inv.amount_due),
  notes: inv.notes,
  signature: inv.signature,
  logo: inv.logo,
  fromQuotationId: inv.from_quotation_id,
  invoiceLang: inv.invoice_lang || 'en',
  payments: inv.payments || [],
  activityLog: inv.activity_log || [],
  convertedFromId: inv.converted_from_id,
  convertedInvoiceId: inv.converted_invoice_id,
  createdBy: inv.created_by,
  createdByName: inv.created_by_name,
  createdVia: inv.created_via,
  // ✅ NEW: E-Way Bill fields
  ewayBillNo: inv.eway_bill_no,
  ewayBillDate: inv.eway_bill_date,
  ewayBillValidUpto: inv.eway_bill_valid_upto,
  ewayBillDetails: inv.eway_bill_details,
});

export const getInvoice = async (req, reply) => {
  try {
    const inv = await getInvoiceById(req.params.id, req.dataScope);
    if (!inv) return reply.status(404).send({ message: 'Not found' });
    return reply.send(toInvoice(inv));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const getInvoices = async (req, reply) => {
  try {
    const rows = await getAllInvoices(req.dataScope);
    return reply.send(rows.map(toInvoice));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const upsertInvoice = async (req, reply) => {
  try {
    const creator = { id: req.user?.id, name: req.user?.name };
    const saved = await saveInvoice(req.body, req.dataScope, req.ownCompanyId, creator);
    if (!saved) return reply.status(404).send({ message: 'Invoice not found' });

    const buyerName = req.body.buyerName;
    const result = await pool.query(
      `SELECT total FROM invoices WHERE buyer_name = $1 AND company_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
      [buyerName, saved.company_id]
    );
    const totalBilled = result.rows.reduce((sum, row) => sum + Number(row.total), 0);
    await pool.query(
      `UPDATE customers SET total_billed = $1 WHERE name = $2 AND company_id IS NOT DISTINCT FROM $3`,
      [totalBilled, buyerName, saved.company_id]
    );

    return reply.send(toInvoice(saved));
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const removeInvoice = async (req, reply) => {
  try {
    await deleteInvoice(req.params.id, req.dataScope);
    return reply.send({ message: 'Deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const getTrash = async (req, reply) => {
  try {
    const rows = await getTrashedInvoices(req.dataScope);
    return reply.send(rows.map(inv => ({
      id: inv.id, invoiceNo: inv.invoice_no, buyerName: inv.buyer_name,
      total: Number(inv.total), deletedAt: inv.deleted_at,
    })));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const restoreFromTrash = async (req, reply) => {
  try {
    const restored = await restoreInvoice(req.params.id, req.dataScope);
    if (!restored) return reply.status(404).send({ message: 'Not found in trash' });
    return reply.send({ message: 'Restored', invoice: restored });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const deletePermanently = async (req, reply) => {
  try {
    await permanentlyDeleteInvoice(req.params.id, req.dataScope);
    return reply.send({ message: 'Permanently deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};