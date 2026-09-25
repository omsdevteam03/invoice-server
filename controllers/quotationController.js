import {
  getAllQuotations, saveQuotation, deleteQuotation,
  getTrashedQuotations, restoreQuotation, permanentlyDeleteQuotation,
} from '../models/quotationModel.js';

function mapQuotationRow(q) {
  return {
    id: q.id, name: q.name, company: q.company,
    email: q.email, phone: q.phone, date: q.date,
    validUntil: q.valid_until, status: q.status, amount: Number(q.amount),
    timeline: q.timeline, description: q.description,
    scopeOfWork: q.scope_of_work, deliverables: q.deliverables,
    technologyUsed: q.technology_used, timelineDesc: q.timeline_desc,
    projectCost: q.project_cost, paymentTerms: q.payment_terms,
    terms: q.terms, notes: q.notes,
    items: q.items, customSections: q.custom_sections, signature: q.signature,
    accentColor: q.accent_color, accentBg: q.accent_bg,
    issuerName: q.issuer_name, issuerAddress: q.issuer_address,
    issuerPhone: q.issuer_phone, issuerEmail: q.issuer_email,
    issuerContact: q.issuer_contact, projectTitle: q.project_title,
    clientAddress: q.client_address, logo: q.logo,
    templateStyle: q.template_style,
costItems: q.cost_items || [], includeGst: q.include_gst !== false, gstPercent: q.gst_percent, gstMode: q.gst_mode || (q.include_gst === false ? 'without' : 'with'),  };
}

export const getQuotations = async (req, reply) => {
  try {
    const rows = await getAllQuotations();
    return reply.send(rows.map(mapQuotationRow));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const upsertQuotation = async (req, reply) => {
  try {
    const { isNew, ...body } = req.body;
    const saved = await saveQuotation(body, Boolean(isNew));
    return reply.send(mapQuotationRow(saved));
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
export const getTrash = async (req, reply) => {
  try {
    const rows = await getTrashedQuotations();
    return reply.send(rows.map(q => ({
      id: q.id, name: q.name, company: q.company,
      amount: Number(q.amount), deletedAt: q.deleted_at,
    })));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const restoreFromTrash = async (req, reply) => {
  try {
    const restored = await restoreQuotation(req.params.id);
    if (!restored) return reply.status(404).send({ message: 'Not found in trash' });
    return reply.send({ message: 'Restored', quotation: restored });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const deletePermanently = async (req, reply) => {
  try {
    await permanentlyDeleteQuotation(req.params.id);
    return reply.send({ message: 'Permanently deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};