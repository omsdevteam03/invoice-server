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
  return result.rows[0];
};

export const deleteProduct = async (id, scope = []) => {
  await pool.query(
    `DELETE FROM products WHERE id = $2 AND ($1::int[] IS NULL OR company_id = ANY($1))`,
    [scope, id]
  );
};