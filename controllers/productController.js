import { getAllProducts, saveProduct, deleteProduct } from '../models/productModel.js';

// Postgres returns NUMERIC columns as strings, so convert them to numbers
const format = (p) => ({
  id: p.id,
  name: p.name,
  type: p.type,
  unit: p.unit ?? '',
  sale_rate: Number(p.sale_rate),
  gst_type: p.gst_type || 'With GST',
  gst_percent: Number(p.gst_percent),
  stock_qty: Number(p.stock_qty),
});

export const getProducts = async (req, reply) => {
  try {
    const rows = await getAllProducts(req.dataScope);
    return reply.send(rows.map(format));
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const upsertProduct = async (req, reply) => {
  try {
    const saved = await saveProduct(req.body, req.dataScope, req.ownCompanyId);
    if (!saved) return reply.status(404).send({ message: 'Product not found' });
    return reply.send(format(saved));
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const removeProduct = async (req, reply) => {
  try {
    await deleteProduct(req.params.id, req.dataScope);
    return reply.send({ message: 'Deleted' });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};