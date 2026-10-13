import pool from '../config/db.js';

// scope = null  -> Admin: sees every product
// scope = [ids] -> other users: only products of their own company
const SCOPE = '($1::int[] IS NULL OR company_id = ANY($1))';

export const getAllProducts = async (scope = []) => {
  const result = await pool.query(
    `SELECT * FROM products WHERE ${SCOPE} ORDER BY created_at DESC`,
    [scope]
  );
  return result.rows;
};

export const saveProduct = async (p, scope = [], ownCompanyId = null) => {
  const result = await pool.query(
    `INSERT INTO products (id, name, type, unit, sale_rate, gst_percent, stock_qty, company_id, gst_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$10)
     ON CONFLICT (id) DO UPDATE SET
       name=$2, type=$3, unit=$4, sale_rate=$5, gst_percent=$6, stock_qty=$7, gst_type=$10
     WHERE ($9::int[] IS NULL OR products.company_id = ANY($9))
     RETURNING *`,
    [
      p.id,
      p.name,
      p.type || 'Product',
      p.unit ?? '',                  // keep "None" (empty) instead of forcing 'Nos'
      p.sale_rate ?? 0,
      p.gst_percent ?? 18,
      p.stock_qty ?? 0,
      ownCompanyId, // $8 - new products are saved under this company
      scope,        // $9 - which existing rows this user may overwrite
      p.gst_type || 'With GST',      // $10
    ]
  );
  return result.rows[0];
};

export const deleteProduct = async (id, scope = []) => {
  await pool.query(
    `DELETE FROM products WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1))`,
    [scope, id]
  );
};