import { getAllQuotations, saveQuotation, deleteQuotation } from '../models/quotationModel.js';

export const getQuotations = async (req, reply) => {
  try {
    const rows = await getAllQuotations();
    const quotations = rows.map(q => ({
      id: q.id, name: q.name, company: q.company,
      email: q.email, phone: q.phone, date: q.date,
      validUntil: q.valid_until, status: q.status, amount: Number(q.amount),
      timeline: q.timeline, description: q.description,
      scopeOfWork: q.scope_of_work, deliverables: q.deliverables,
      technologyUsed: q.technology_used, timelineDesc: q.timeline_desc,
      projectCost: q.project_cost, paymentTerms: q.payment_terms,
      terms: q.terms, notes: q.notes,
      items: q.items, customSections: q.custom_sections, signature: q.signature,
    }));
    return reply.send(quotations);
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const upsertQuotation = async (req, reply) => {
  try {
    const saved = await saveQuotation(req.body);
    return reply.send(saved);
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const removeQuotation = async (req, reply) => {
  try {
    await deleteQuotation(req.params.id);
    return reply.send({ message: 'Deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};