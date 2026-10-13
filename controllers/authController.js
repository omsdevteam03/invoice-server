import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { findUserByEmail } from '../models/userModel.js';

export const login = async (req, reply) => {
  const { email, password } = req.body || {};
  if (!email || !password) return reply.status(400).send({ message: 'Enter email and password.' });
  try {
    const user = await findUserByEmail(email);
    // same message for "no such user" and "wrong password" so nobody can probe which emails exist
    if (!user) return reply.status(401).send({ message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return reply.status(401).send({ message: 'Invalid email or password' });
    if (user.status && user.status !== 'Active') {
      return reply.status(403).send({ message: 'This account is inactive.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    return reply.send({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.log('Error:', err.message);
    return reply.status(500).send({ message: 'Server error', error: err.message });
  }
};