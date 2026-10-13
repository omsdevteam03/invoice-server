// controllers/usersController.js — NO imports. `model` and `bcrypt` are injected by the routes file.
const ROLES = ['Admin', 'Manager', 'Sales', 'Accountant', 'Viewer'];
const STATUSES = ['Active', 'Inactive'];

export const createUsersController = ({ model, bcrypt }) => {
  const fail = (reply, code, message) => reply.status(code).send({ message });

  // Returns an error message, or '' when the payload is valid
  const validate = (b, { creating }) => {
    if (!b.fullName?.trim()) return 'Enter the user’s full name.';
    if (!/^\S+@\S+\.\S+$/.test(b.email || '')) return 'Enter a valid email address.';
    if (creating && (b.password || '').length < 8) return 'Password must be at least 8 characters.';
    if (!creating && b.password && b.password.length < 8) return 'New password must be at least 8 characters.';
    if (!ROLES.includes(b.role)) return 'Choose a valid role.';
    if (!STATUSES.includes(b.status)) return 'Choose a valid status.';
    if (!Array.isArray(b.companyIds) || b.companyIds.length === 0) return 'Assign at least one company.';
    if (!b.companyIds.every(Number.isInteger)) return 'Invalid company selection.';
    return '';
  };

  // Stops the last active Admin from being demoted, deactivated or deleted
  const isLastAdmin = async (target) =>
    target.role === 'Admin' && target.status === 'Active' && (await model.countActiveAdmins()) <= 1;

  return {
    async list(request, reply) {
      return reply.send({ users: await model.findAll() });
    },

    async companies(request, reply) {
      return reply.send({ companies: await model.listCompanies() });
    },

    async limit(request, reply) {
      return reply.send({ limit: await model.getUserLimit(), count: await model.countUsers() });
    },

    async setLimit(request, reply) {
      const raw = request.body?.limit;
      const limit = raw === null || raw === '' || raw === undefined ? null : Number(raw);
      if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
        return fail(reply, 400, 'Enter a whole number of 1 or more.');
      }
      const count = await model.countUsers();
      if (limit !== null && limit < count) {
        return fail(reply, 400, `You already have ${count} users. Set the limit to ${count} or more.`);
      }
      await model.setUserLimit(limit);
      return reply.send({ limit, count });
    },

    async create(request, reply) {
      const b = request.body || {};
      const msg = validate(b, { creating: true });
      if (msg) return fail(reply, 400, msg);
      if (await model.findByEmail(b.email)) return fail(reply, 409, 'A user with this email already exists.');

      const userLimit = await model.getUserLimit();
      if (userLimit !== null && (await model.countUsers()) >= userLimit) {
        return fail(reply, 403, `User limit reached (${userLimit}). Increase the limit to add more users.`);
      }

      const id = await model.create({
        fullName: b.fullName.trim(),
        email: b.email.trim(),
        passwordHash: await bcrypt.hash(b.password, 10),
        role: b.role,
        status: b.status,
        companyIds: [...new Set(b.companyIds)],
      });
      return reply.status(201).send({ user: await model.findById(id) });
    },

    async update(request, reply) {
      const id = Number(request.params.id);
      const b = request.body || {};
      const existing = await model.findById(id);
      if (!existing) return fail(reply, 404, 'User not found.');

      const msg = validate(b, { creating: false });
      if (msg) return fail(reply, 400, msg);

      const clash = await model.findByEmail(b.email);
      if (clash && clash.id !== id) return fail(reply, 409, 'A user with this email already exists.');

      const losingAdmin = existing.role === 'Admin' && (b.role !== 'Admin' || b.status !== 'Active');
      if (losingAdmin && (await isLastAdmin(existing))) {
        return fail(reply, 400, 'At least one active Admin is required.');
      }

      await model.update(id, {
        fullName: b.fullName.trim(),
        email: b.email.trim(),
        passwordHash: b.password ? await bcrypt.hash(b.password, 10) : null,
        role: b.role,
        status: b.status,
        companyIds: [...new Set(b.companyIds)],
      });
      return reply.send({ user: await model.findById(id) });
    },

    async setStatus(request, reply) {
      const id = Number(request.params.id);
      const { status } = request.body || {};
      if (!STATUSES.includes(status)) return fail(reply, 400, 'Choose a valid status.');

      const existing = await model.findById(id);
      if (!existing) return fail(reply, 404, 'User not found.');
      if (id === request.user.id && status === 'Inactive') return fail(reply, 400, 'You can’t deactivate your own account.');
      if (status === 'Inactive' && (await isLastAdmin(existing))) return fail(reply, 400, 'At least one active Admin is required.');

      await model.setStatus(id, status);
      return reply.send({ user: await model.findById(id) });
    },

    async remove(request, reply) {
      const id = Number(request.params.id);
      const existing = await model.findById(id);
      if (!existing) return fail(reply, 404, 'User not found.');
      if (id === request.user.id) return fail(reply, 400, 'You can’t delete your own account.');
      if (await isLastAdmin(existing)) return fail(reply, 400, 'At least one active Admin is required.');

      await model.remove(id);
      return reply.send({ success: true });
    },
  };
};