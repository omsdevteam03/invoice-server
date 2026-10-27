import pool from '../config/db.js';
import {
  getAllCustomers, saveCustomer, deleteCustomer,
  getTrashedCustomers, restoreCustomer, permanentlyDeleteCustomer,
} from '../models/customerModel.js';

// Next free CUST-xxx across ALL companies (including trashed customers)
const nextCustomerId = async () => {
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 6) AS INT)), 0) + 1 AS n
     FROM customers WHERE id ~ '^CUST-[0-9]+$'`
  );
  return `CUST-${String(rows[0].n).padStart(3, '0')}`;
};

export const getCustomers = async (req, reply) => {
  try {
    const rows = await getAllCustomers(req.dataScope);
    const customers = rows.map(c => ({
      id: c.id,
      title: c.title,
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
      createdBy: c.created_by,
      createdByName: c.created_by_name,
      products: c.products || [],
    }));
    return reply.send(customers);
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};


export const upsertCustomer = async (req, reply) => {
  try {
    const { isNew, ...customerData } = req.body;

    // The form picks its id from the customers this user can see. If that id is
    // already used by another company, give this customer a fresh id instead.
    if (req.dataScope) {
      const { rows } = await pool.query('SELECT company_id FROM customers WHERE id = $1', [customerData.id]);
      if (rows[0] && !req.dataScope.includes(rows[0].company_id)) {
        customerData.id = await nextCustomerId();
      }
    }

    const creator = {
      id: req.user?.id ?? customerData.createdBy,
      name: req.user?.name ?? customerData.createdByName,
    };
    const saved = await saveCustomer(customerData, req.dataScope, req.ownCompanyId, creator);
    if (!saved) return reply.status(404).send({ message: 'Customer not found' });
    return reply.send(saved);
  } catch (err) {
    req.log.error(err);
    return reply.status(err.statusCode || 500).send({ message: err.message, error: err.message });
  }
};

export const removeCustomer = async (req, reply) => {
  try {
    await deleteCustomer(req.params.id, req.dataScope);
    return reply.send({ message: 'Deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};
export const getTrash = async (req, reply) => {
  try {
    const rows = await getTrashedCustomers(req.dataScope);
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
    const restored = await restoreCustomer(req.params.id, req.dataScope);
    if (!restored) return reply.status(404).send({ message: 'Not found in trash' });
    return reply.send({ message: 'Restored', customer: restored });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const deletePermanently = async (req, reply) => {
  try {
    await permanentlyDeleteCustomer(req.params.id, req.dataScope);
    return reply.send({ message: 'Permanently deleted' });
  } catch (err) {
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};