import Admin from '../models/Admin.js';
import bcrypt from 'bcryptjs';

function sendError(res, status, message, meta) {
  const body = { ok: false, message: message || 'Error' };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

// PATCH /api/admin/settings
export const updateSettings = async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { username, email, currentPassword, newPassword } = req.body || {};
    const admin = await Admin.findById(userId);
    if (!admin) return sendError(res, 404, 'Admin not found');

    // Validate and check uniqueness for username/email if provided
    if (username && username !== admin.username) {
      const existing = await Admin.findOne({ username }).select('_id').lean().exec();
      if (existing && String(existing._id) !== String(userId)) {
        return sendError(res, 409, 'Username already taken');
      }
      admin.username = username;
    }

    if (email && email !== admin.email) {
      const existing = await Admin.findOne({ email }).select('_id').lean().exec();
      if (existing && String(existing._id) !== String(userId)) {
        return sendError(res, 409, 'Email already in use');
      }
      // basic email format check
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return sendError(res, 400, 'Invalid email format');
      }
      admin.email = email;
    }

    // If changing password, require currentPassword and validate
    if (newPassword) {
      if (!currentPassword) return sendError(res, 400, 'Current password required');
      // basic password policy
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return sendError(res, 400, 'New password must be at least 8 characters');
      }
      const ok = await bcrypt.compare(currentPassword, admin.password);
      if (!ok) return sendError(res, 403, 'Current password incorrect');
      const hashed = await bcrypt.hash(newPassword, 10);
      admin.password = hashed;
    }

    await admin.save();
    return res.json({ ok: true, message: 'Settings updated' });
  } catch (err) {
    console.error('admin.updateSettings error', err);
    // Handle mongoose validation / duplicate key errors gracefully
    if (err && err.name === 'ValidationError') {
      return sendError(res, 400, 'Validation failed', err.errors || null);
    }
    if (err && err.code === 11000) {
      // duplicate key
      return sendError(res, 409, 'Duplicate value', err.keyValue || null);
    }
    return sendError(res, 500, 'Server error');
  }
};

export default { updateSettings };
