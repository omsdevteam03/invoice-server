import jwt from 'jsonwebtoken';
import db from '../config/db.js';

export const adminOnly = async (request, reply) => {
  if (request.user?.role !== 'Admin') {
    return reply.status(403).send({ message: 'Only Admins can do this.' });
  }
};

export const authenticate = async (request, reply) => {
  const token = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');

  // 1. Token check: only this step may produce "your login is invalid"
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    console.error('AUTH TOKEN ERROR:', err.name, '-', err.message);
    return reply.status(401).send({
      message: err.name === 'TokenExpiredError' ? 'Session expired. Please sign in again.' : 'Invalid session token. Please sign in again.',
      code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }

  // 2. User lookup: a failure here is a server problem, not a bad login
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.status,
              COALESCE(array_agg(uc.company_id) FILTER (WHERE uc.company_id IS NOT NULL), '{}') AS "companyIds"
       FROM users u LEFT JOIN user_companies uc ON uc.user_id = u.id
       WHERE u.id = $1 GROUP BY u.id`,
      [payload.id]
    );
    const user = rows[0];
    if (!user || user.status !== 'Active') {
      return reply.status(401).send({ message: 'Account not available. Please sign in again.', code: 'USER_INACTIVE' });
    }
    if (!user.companyIds.length) {
      return reply.status(403).send({ message: 'No company is assigned to your account.' });
    }
    request.user = user;
    request.companyIds = user.companyIds;
    request.dataScope = user.role === 'Admin' ? null : user.companyIds;
    request.ownCompanyId = user.companyIds[0];
  } catch (err) {
    // database / unexpected error: do NOT tell the client to log out
    console.error('AUTH DB ERROR:', err.name, '-', err.message);
    return reply.status(503).send({ message: 'Server is busy, please try again.' });
  }
};