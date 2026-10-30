import { getAllProducts, saveProduct, deleteProduct, getMovements, adjustStock, clearMovements } from '../models/productModel.js';

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
  // "hsn" is what ProductForm uses, "hsn_code" is what InvoiceForm uses
  hsn: p.hsn_code ?? '',
  hsn_code: p.hsn_code ?? '',
  category: p.category ?? '',
  item_code: p.item_code ?? '',
  sale_tax_mode: p.sale_tax_mode || (p.gst_type === 'GST Included' ? 'With Tax' : 'Without Tax'),
  discount: Number(p.discount || 0),
  discount_type: p.discount_type || 'Percentage',
  wholesale_rate: Number(p.wholesale_rate || 0),
  wholesale_tax_mode: p.wholesale_tax_mode || 'Without Tax',
  min_wholesale_qty: Number(p.min_wholesale_qty || 0),
  purchase_rate: Number(p.purchase_rate || 0),
  purchase_tax_mode: p.purchase_tax_mode || 'Without Tax',
  at_price: Number(p.at_price || 0),
  as_of_date: p.as_of_date || '',
  min_stock: Number(p.min_stock || 0),
  location: p.location ?? '',
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
    const saved = await saveProduct(req.body, req.dataScope, req.ownCompanyId, {
      id: req.user?.id,
      name: req.user?.name,
    });
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

const formatMove = (m) => ({
  id: m.id,
  product_id: m.product_id,
  product_name: m.product_name,
  type: m.movement_type,
  qty: Number(m.qty),
  balance_after: m.balance_after === null ? null : Number(m.balance_after),
  note: m.note ?? '',
  created_by_name: m.created_by_name ?? '',
  created_at: m.created_at,
  product_deleted: !!m.product_deleted,
});

export const listMovements = async (req, reply) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const rows = await getMovements(req.dataScope, {
      limit,
      productId: req.query.productId || null,
    });
    return reply.send(rows.map(formatMove));
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const clearHistory = async (req, reply) => {
  // dataScope is null only for Admin
  if (req.dataScope !== null) {
    return reply.status(403).send({ message: 'Only Admin can clear stock history.' });
  }
  try {
    const deleted = await clearMovements(req.dataScope);
    return reply.send({ message: 'Stock history cleared', deleted });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};

export const adjust = async (req, reply) => {
  const { productId, mode, qty, note } = req.body || {};
  const n = Number(qty);
  if (!productId || !['in', 'out', 'set'].includes(mode)) {
    return reply.status(400).send({ message: 'Choose a product and an action.' });
  }
  if (!Number.isFinite(n) || n < 0 || (mode !== 'set' && n === 0)) {
    return reply.status(400).send({ message: 'Enter a valid quantity.' });
  }
  try {
    const out = await adjustStock(
      { productId, mode, qty: n, note: (note || '').trim() },
      req.dataScope,
      { id: req.user?.id, name: req.user?.name }
    );
    if (out.error) return reply.status(out.status || 400).send({ message: out.error });
    return reply.send(out);
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};