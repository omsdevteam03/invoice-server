import { getAllCustomers, saveCustomer, deleteCustomer } from '../models/customerModel.js';

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
      phones: c.phones || [],
      supportNumber: c.support_number,
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