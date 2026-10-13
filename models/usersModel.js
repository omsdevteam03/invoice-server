// models/usersModel.js — NO imports. `db` (your pg Pool) is injected by the routes file.
const SELECT_USERS = `
  SELECT u.id, u.name AS "fullName", u.email, u.role, u.status,
         COALESCE(array_agg(uc.company_id) FILTER (WHERE uc.company_id IS NOT NULL), '{}') AS "companyIds"
  FROM users u
  LEFT JOIN user_companies uc ON uc.user_id = u.id`;

export const createUsersModel = (db) => {
  // Runs fn inside a transaction (needs db to be a pg Pool)
  const tx = async (fn) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };

  const setCompanies = async (client, userId, companyIds) => {
    await client.query('DELETE FROM user_companies WHERE user_id = $1', [userId]);
    if (companyIds.length) {
      await client.query(
        'INSERT INTO user_companies (user_id, company_id) SELECT $1, UNNEST($2::int[])',
        [userId, companyIds]
      );
    }
  };

  return {
    async findAll() {
      const { rows } = await db.query(`${SELECT_USERS} GROUP BY u.id ORDER BY u.created_at DESC`);
      return rows;
    },

    async findById(id) {
      const { rows } = await db.query(`${SELECT_USERS} WHERE u.id = $1 GROUP BY u.id`, [id]);
      return rows[0] || null;
    },

    async findByEmail(email) {
      const { rows } = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      return rows[0] || null;
    },

    async create({ fullName, email, passwordHash, role, status, companyIds }) {
      return tx(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO users (name, email, password, role, status)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [fullName, email, passwordHash, role, status]
        );
        await setCompanies(client, rows[0].id, companyIds);
        return rows[0].id;
      });
    },

    // passwordHash is optional: omit to keep the current password
    async update(id, { fullName, email, passwordHash, role, status, companyIds }) {
      return tx(async (client) => {
        await client.query(
          `UPDATE users SET name = $2, email = $3, role = $4, status = $5,
                  password = COALESCE($6, password)
           WHERE id = $1`,
          [id, fullName, email, role, status, passwordHash || null]
        );
        await setCompanies(client, id, companyIds);
      });
    },

    async setStatus(id, status) {
      const { rowCount } = await db.query('UPDATE users SET status = $2 WHERE id = $1', [id, status]);
      return rowCount > 0;
    },

    async remove(id) {
      const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [id]);
      return rowCount > 0;
    },

    async countActiveAdmins() {
      const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'Admin' AND status = 'Active'`);
      return rows[0].n;
    },

    async countUsers() {
      const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users');
      return rows[0].n;
    },

    // returns a number, or null when there is no limit
    async getUserLimit() {
      const { rows } = await db.query(`SELECT value FROM app_settings WHERE key = 'max_users'`);
      return rows[0] && rows[0].value !== '' ? Number(rows[0].value) : null;
    },

    async setUserLimit(limit) {
      await db.query(
        `INSERT INTO app_settings (key, value) VALUES ('max_users', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [limit === null ? '' : String(limit)]
      );
    },

    async listCompanies() {
      const { rows } = await db.query(
        'SELECT id, company_name AS name FROM company_settings ORDER BY company_name'
      );
      return rows;
    },

    // Use this in your other models/routes to enforce company-based access
    async getCompanyIdsForUser(userId) {
      const { rows } = await db.query('SELECT company_id FROM user_companies WHERE user_id = $1', [userId]);
      return rows.map((r) => r.company_id);
    },
  };
};