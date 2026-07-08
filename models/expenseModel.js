import pool from '../config/db.js';

export const getAllExpenses = async () => {
  const result = await pool.query(`SELECT * FROM expenses ORDER BY date DESC`);
  return result.rows;
};

export const saveExpense = async (expense) => {
  const { id, title, category, amount, date, note } = expense;

  const existing = await pool.query(`SELECT id FROM expenses WHERE id = $1`, [id]);

  if (existing.rows.length > 0) {
    const result = await pool.query(
      `UPDATE expenses SET title=$1, category=$2, amount=$3, date=$4, note=$5
       WHERE id=$6 RETURNING *`,
      [title, category, amount, date, note, id]
    );
    return result.rows[0];
  } else {
    const result = await pool.query(
      `INSERT INTO expenses (id, title, category, amount, date, note)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, title, category, amount, date, note]
    );
    return result.rows[0];
  }
};

export const deleteExpense = async (id) => {
  await pool.query(`DELETE FROM expenses WHERE id = $1`, [id]);
};