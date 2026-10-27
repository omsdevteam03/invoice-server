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