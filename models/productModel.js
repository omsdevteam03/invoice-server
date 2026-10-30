import pool from '../config/db.js';

// scope = null  -> Admin: sees every product
// scope = [ids] -> other users: only products of their own company
const SCOPE = '($1::int[] IS NULL OR company_id = ANY($1))';

export const getAllProducts = async (scope = []) => {
  const result = await pool.query(
`SELECT * FROM products WHERE ${SCOPE} ORDER BY created_at DESC, id DESC`,    [scope]
  );
  return result.rows;
};

export const saveProduct = async (p, scope = [], ownCompanyId = null, creator = null) => {
  // stock before this save, so the change can be recorded
  const before = await pool.query('SELECT stock_qty FROM products WHERE id = $1', [p.id]);
  const oldQty = before.rows[0] ? Number(before.rows[0].stock_qty) : null;

  const result = await pool.query(
    `INSERT INTO products (
       id, name, type, unit, sale_rate, gst_percent, stock_qty, company_id, gst_type,
       hsn_code, category, item_code, sale_tax_mode, discount, discount_type,
       wholesale_rate, wholesale_tax_mode, min_wholesale_qty,
       purchase_rate, purchase_tax_mode, at_price, as_of_date, min_stock, location
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     ON CONFLICT (id) DO UPDATE SET
       name=$2, type=$3, unit=$4, sale_rate=$5, gst_percent=$6, stock_qty=$7, gst_type=$10,
       hsn_code=$11, category=$12, item_code=$13, sale_tax_mode=$14, discount=$15, discount_type=$16,
       wholesale_rate=$17, wholesale_tax_mode=$18, min_wholesale_qty=$19,
       purchase_rate=$20, purchase_tax_mode=$21, at_price=$22, as_of_date=$23, min_stock=$24, location=$25
     WHERE ($9::int[] IS NULL OR products.company_id = ANY($9))
     RETURNING *`,
    [
      p.id,
      p.name,
      p.type || 'Product',
      p.unit ?? '',
      p.sale_rate ?? 0,
      p.gst_percent ?? 18,
      p.stock_qty ?? 0,
      ownCompanyId,                          // $8
      scope,                                 // $9
      p.gst_type || 'With GST',              // $10
      p.hsn ?? p.hsn_code ?? '',             // $11 (form sends "hsn")
      p.category ?? '',                      // $12
      p.item_code ?? '',                     // $13
      p.sale_tax_mode || 'Without Tax',      // $14
      p.discount ?? 0,                       // $15
      p.discount_type || 'Percentage',       // $16
      p.wholesale_rate ?? 0,                 // $17
      p.wholesale_tax_mode || 'Without Tax', // $18
      p.min_wholesale_qty ?? 0,              // $19
      p.purchase_rate ?? 0,                  // $20
      p.purchase_tax_mode || 'Without Tax',  // $21
      p.at_price ?? 0,                       // $22
      p.as_of_date || '',                    // $23
      p.min_stock ?? 0,                      // $24
      p.location ?? '',                      // $25
    ]
  );
  const row = result.rows[0];
  if (row && row.type !== 'Service') {
    const diff = Number(row.stock_qty) - (oldQty ?? 0);
    if (diff !== 0) {
      try {
        await logMovement({
          productId: row.id, productName: row.name, companyId: row.company_id,
          type: diff > 0 ? 'in' : 'out', qty: diff, balanceAfter: Number(row.stock_qty),
          note: p.stock_note || (oldQty === null ? 'Initial stock' : 'Stock updated in item form'),
          creator,
        });
      } catch (err) {
        console.error('Stock movement log failed:', err.message); // never block the product save
      }
    }
  }
  return row;
};

export const deleteProduct = async (id, scope = []) => {
  await pool.query(
    `DELETE FROM products WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1))`,
    [scope, id]
  );
};

export const logMovement = (m, db = pool) =>
  db.query(
    `INSERT INTO stock_movements
       (product_id, product_name, company_id, movement_type, qty, balance_after, note, created_by, created_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      m.productId, m.productName, m.companyId ?? null, m.type, m.qty, m.balanceAfter ?? null,
      m.note || null,
      m.creator?.id != null ? String(m.creator.id) : null,
      m.creator?.name || null,
    ]
  );

export const getMovements = async (scope = null, { limit = 50, productId = null } = {}) => {
  const r = await pool.query(
    `SELECT m.*, (p.id IS NULL) AS product_deleted
     FROM stock_movements m
     LEFT JOIN products p ON p.id = m.product_id
     WHERE ($1::int[] IS NULL OR m.company_id = ANY($1))
       AND ($2::text IS NULL OR m.product_id = $2)
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $3`,
    [scope, productId, limit]
  );
  return r.rows;
};

export const clearMovements = async (scope = null) => {
  const r = await pool.query(
    `DELETE FROM stock_movements WHERE ($1::int[] IS NULL OR company_id = ANY($1))`,
    [scope]
  );
  return r.rowCount;
};

// mode: 'in' (add) | 'out' (reduce) | 'set' (exact count)
export const adjustStock = async ({ productId, mode, qty, note }, scope, creator) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT id, name, type, stock_qty, company_id FROM products
       WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1)) FOR UPDATE`,
      [scope, productId]
    );
    const p = r.rows[0];
    if (!p) { await client.query('ROLLBACK'); return { error: 'Product not found.', status: 404 }; }
    if (p.type === 'Service') { await client.query('ROLLBACK'); return { error: 'Services do not have stock.', status: 400 }; }

    const current = Number(p.stock_qty) || 0;
    const next = mode === 'in' ? current + qty : mode === 'out' ? current - qty : qty;
    if (next < 0) { await client.query('ROLLBACK'); return { error: `Only ${current} in stock.`, status: 400 }; }

    await client.query('UPDATE products SET stock_qty = $1 WHERE id = $2', [next, p.id]);
    await logMovement({
      productId: p.id, productName: p.name, companyId: p.company_id,
      type: mode === 'set' ? 'adjust' : mode,
      qty: next - current, balanceAfter: next,
      note: note || (mode === 'in' ? 'Stock added' : mode === 'out' ? 'Stock reduced' : 'Stock count corrected'),
      creator,
    }, client);

    await client.query('COMMIT');
    return { productId: p.id, name: p.name, stock_qty: next };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};