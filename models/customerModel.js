import pool from '../config/db.js';

// scope = null  -> Admin: sees every customer
// scope = [ids] -> other users: only customers of their own company
// scope left out -> nothing (so a forgotten argument can never leak data)
const SCOPE = '($1::int[] IS NULL OR company_id = ANY($1))';

export const getAllCustomers = async (scope = []) => {
  const result = await pool.query(
    `SELECT * FROM customers WHERE deleted_at IS NULL AND ${SCOPE} ORDER BY created_at DESC`,
    [scope]
  );
  return result.rows;
};
// Total qty per product: Map { productId -> qty }
const toQtyMap = (list) => {
  const m = new Map();
  for (const p of list || []) {
    if (!p?.productId) continue;
    m.set(p.productId, (m.get(p.productId) || 0) + (Number(p.qty) || 1));
  }
  return m;
};

export const saveCustomer = async (c, scope = [], ownCompanyId = null, creator = {}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // What this customer already held before this save
    const prev = await client.query(
      `SELECT products FROM customers
       WHERE id = $1 AND ($2::int[] IS NULL OR company_id = ANY($2)) FOR UPDATE`,
      [c.id, scope]
    );
    const oldQty = toQtyMap(prev.rows[0]?.products);
    const newQty = toQtyMap(c.products);

    const result = await client.query(`
      INSERT INTO customers (
        id, name, company, email, emails, phone, phones, support_number,
        whatsapp, whatsapps,
        status, type, category, total_billed,
        address, addresses, since, notes, tags,
        city, state, country, gst_number, customer_type, company_id,
        created_by, created_by_name, products
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$27,$28,$29)
      ON CONFLICT (id) DO UPDATE SET
        name=$2, company=$3, email=$4, emails=$5, phone=$6, phones=$7, support_number=$8,
        whatsapp=$9, whatsapps=$10,
        status=$11, type=$12, category=$13, total_billed=$14,
        address=$15, addresses=$16, since=$17, notes=$18, tags=$19,
        city=$20, state=$21, country=$22, gst_number=$23, customer_type=$24,
        products=$29,
        deleted_at=NULL
      WHERE ($26::int[] IS NULL OR customers.company_id = ANY($26))
      RETURNING *`,
      [
        c.id, c.name, c.company, c.email,
        JSON.stringify(c.emails || []),
        c.phone,
        JSON.stringify(c.phones || []),
        c.supportNumber || null,
        c.whatsapp || null,
        JSON.stringify(c.whatsapps || []),
        c.status,
        c.type || c.customerType || 'Business',
        c.category || null,
        c.totalBilled ?? 0,
        c.address || null,
        JSON.stringify(c.addresses || []),
        c.since || null,
        JSON.stringify(c.notes || []),
        c.tags && c.tags.length ? c.tags : [],
        c.city || null,
        c.state || null,
        c.country || 'India',
        c.gstNumber || null,
        c.customerType || 'Business',
        ownCompanyId,
        scope,
        creator.id != null ? String(creator.id) : null,
        creator.name || null,
        JSON.stringify(c.products || []),
      ]
    );

    if (!result.rows[0]) {          // this user is not allowed to overwrite this row
      await client.query('ROLLBACK');
      return undefined;
    }

    // Change stock only by the DIFFERENCE
    for (const pid of new Set([...oldQty.keys(), ...newQty.keys()])) {
      const delta = (newQty.get(pid) || 0) - (oldQty.get(pid) || 0);
      if (delta === 0) continue;

      const upd = await client.query(
        `UPDATE products
         SET stock_qty = stock_qty - $1::int
         WHERE id = $2 AND COALESCE(type, 'Product') <> 'Service'
           AND ($1::int <= 0 OR stock_qty >= $1::int)`,
        [delta, pid]
      );

      if (upd.rowCount === 0) {
        const p = await client.query('SELECT name, type, stock_qty FROM products WHERE id = $1', [pid]);
        const row = p.rows[0];
        if (row && row.type !== 'Service') {
          const err = new Error(`Not enough stock for ${row.name}. Only ${row.stock_qty} available.`);
          err.statusCode = 400;
          throw err;
        }
      }
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const deleteCustomer = async (id, scope = []) => {
  await pool.query(
    `UPDATE customers SET deleted_at = NOW() WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1))`,
    [scope, id]
  );
};

export const getTrashedCustomers = async (scope = []) => {
  const result = await pool.query(
    `SELECT * FROM customers WHERE deleted_at IS NOT NULL AND ${SCOPE} ORDER BY deleted_at DESC`,
    [scope]
  );
  return result.rows;
};

export const restoreCustomer = async (id, scope = []) => {
  const result = await pool.query(
    `UPDATE customers SET deleted_at = NULL WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1)) RETURNING *`,
    [scope, id]
  );
  return result.rows[0];
};

export const permanentlyDeleteCustomer = async (id, scope = []) => {
  await pool.query(
    `DELETE FROM customers WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1))`,
    [scope, id]
  );
};

export const purgeOldTrashedCustomers = async () => {
  await pool.query(`DELETE FROM customers WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'`);
};