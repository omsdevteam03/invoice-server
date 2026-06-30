import { getAllCustomers, saveCustomer, deleteCustomer } from '../models/customerModel.js';
import { saveQuotation } from '../models/quotationModel.js';
import { saveInvoice } from '../models/invoiceModel.js';

// ── Helper: today & +30 days ─────
const today = () => new Date().toISOString().split('T')[0];
const plus30 = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

// ── Auto-create Draft Quotation (with full default content, editable) ───────
async function autoCreateQuotation(customer, index) {
  const defaultAmount = 25000;
  const tax = Math.round(defaultAmount * 0.18);

  const quotation = {
    id: `QT-${String(index).padStart(3, '0')}`,
    name: customer.name,
    company: customer.company || '',
    email: customer.email,
    phone: customer.phone || '',
    date: today(),
    validUntil: plus30(),
    status: 'Draft',
    amount: defaultAmount,
    timeline: '7-14 days',
    description: `This proposal outlines the scope of work agreed upon between Orange Mega Software and ${customer.name}.`,
    scopeOfWork: 'Responsive Website Design\n5 Website Pages\nContact Form Integration\nMobile Optimization\nBasic SEO Setup',
    deliverables: 'Fully responsive website\nSource code delivery\nAdmin panel access\nDocumentation\n30 days support',
    technologyUsed: 'React.js / Next.js (Frontend)\nNode.js & Express.js (Backend)\nMongoDB (Database)\nCloud Hosting (Deployment)',
    timelineDesc: 'Completed within 7\u201314 working days from project confirmation\nDevelopment carried out in phases\nRegular progress updates shared with client',
    projectCost: `Service / Product: \u20b9${defaultAmount.toLocaleString()}\nDeployment & Setup: Included\nGST (18%): \u20b9${tax.toLocaleString()}\nTotal Project Cost: \u20b9${(defaultAmount + tax).toLocaleString()}`,
    paymentTerms: '50% advance payment required before project commencement\nRemaining 50% after preview approval and before final delivery',
    terms: 'This quotation is valid for 30 days from the date of issue\nAny additional work outside the agreed scope will be charged separately\n50% advance payment is required before project commencement\nFinal deliverables handed over after full payment is received',
    notes: '',
    items: [{ description: 'Service / Product', qty: 1, rate: defaultAmount, total: defaultAmount }],
    customSections: [],
    signature: null,
  };
  const saved = await saveQuotation(quotation);
  return saved.id;
}

// ── Auto-create Draft Invoice (matches YOUR invoice table schema) ───────────
async function autoCreateInvoice(customer, index) {
  const invoice = {
    id: `INV-${String(index).padStart(3, '0')}`,
    buyerName: customer.name,
    company: customer.company || '',
    email: customer.email,
    phone: customer.phone || '',
    date: today(),
    dueDate: plus30(),
    status: 'Draft',
    items: [{ sl: 1, description: 'Service / Product', qty: 1, rate: 0, amount: 0 }],
    tax: 0,
    discount: 0,
    total: 0,
    amountDue: 0,
    notes: '',
  };
  const saved = await saveInvoice(invoice);
  return saved.id;
}

// ── GET /api/customers ────
export const getCustomers = async (req, reply) => {
  try {
    const rows = await getAllCustomers();
    const customers = rows.map(c => ({
      id: c.id,
      name: c.name,
      company: c.company,
      email: c.email,
      phone: c.phone,
      status: c.status,
      type: c.type,
      category: c.category,
      totalBilled: Number(c.total_billed),
      createdAt: c.created_at,
    }));
    return reply.send(customers);
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ── POST /api/customers ────
export const upsertCustomer = async (req, reply) => {
  try {
    const { isNew, ...customerData } = req.body;
    const saved = await saveCustomer(customerData);

    if (isNew) {
      try {
        const allCustomers = await getAllCustomers();
        const index = allCustomers.length;
        const qId = await autoCreateQuotation(customerData, index);
        const iId = await autoCreateInvoice(customerData, index);
        console.log(`✅ Auto-created: ${qId} + ${iId} for "${customerData.name}"`);
      } catch (autoErr) {
        console.error('⚠️ Auto-create quotation/invoice failed:', autoErr.message);
      }
    }

    return reply.send(saved);
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

// ── DELETE /api/customers/:id ───
export const removeCustomer = async (req, reply) => {
  try {
    await deleteCustomer(req.params.id);
    return reply.send({ message: 'Deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};
