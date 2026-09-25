import {
  getAllCustomers, saveCustomer, deleteCustomer,
  getTrashedCustomers, restoreCustomer, permanentlyDeleteCustomer,
} from '../models/customerModel.js';

export const getCustomers = async (req, reply) => {
  try {
    const rows = await getAllCustomers();
    const customers = rows.map(c => ({
      id: c.id,
      name: c.name,
      company: c.company,
      email: c.email,
      emails: c.emails || [],
      phone: c.phone,
      phones: c.phones || [],
      supportNumber: c.support_number,
      whatsapp: c.whatsapp,
      whatsapps: c.whatsapps || [],
      status: c.status,
      type: c.type,
      category: c.category,
      totalBilled: Number(c.total_billed),
      createdAt: c.created_at,
      address: c.address,
      addresses: c.addresses || [],
      since: c.since ? new Date(c.since).toISOString().split('T')[0] : null,
      notes: c.notes || [],
      tags: c.tags || [],
      city: c.city,
      state: c.state,
      country: c.country,
      gstNumber: c.gst_number,
      customerType: c.customer_type,
    }));
    return reply.send(customers);
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const upsertCustomer = async (req, reply) => {
  try {
    const { isNew, ...customerData } = req.body;
    const saved = await saveCustomer(customerData);
    return reply.send(saved);
  } catch (err) {
    req.log.error(err); // logs the real Postgres error server-side instead of just failing silently
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const removeCustomer = async (req, reply) => {
  try {
    await deleteCustomer(req.params.id);
    return reply.send({ message: 'Deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};
export const getTrash = async (req, reply) => {
  try {
    const rows = await getTrashedCustomers();
    return reply.send(rows.map(c => ({
      id: c.id, name: c.name, company: c.company, email: c.email,
      phone: c.phone, deletedAt: c.deleted_at,
    })));
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const restoreFromTrash = async (req, reply) => {
  try {
    const restored = await restoreCustomer(req.params.id);
    if (!restored) return reply.status(404).send({ message: 'Not found in trash' });
    return reply.send({ message: 'Restored', customer: restored });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const deletePermanently = async (req, reply) => {
  try {
    await permanentlyDeleteCustomer(req.params.id);
    return reply.send({ message: 'Permanently deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};