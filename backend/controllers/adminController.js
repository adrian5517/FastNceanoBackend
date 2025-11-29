import Admin from '../models/Admin.js';
import bcrypt from 'bcryptjs';

// PATCH /api/admin/settings
export const updateSettings = async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { username, email, currentPassword, newPassword } = req.body || {};
    const admin = await Admin.findById(userId);
    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    // Update username/email if provided
    if (username) admin.username = username;
    if (email) admin.email = email;

    // If changing password, require currentPassword and validate
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ message: 'Current password required' });
      const ok = await bcrypt.compare(currentPassword, admin.password);
      if (!ok) return res.status(403).json({ message: 'Current password incorrect' });
      const hashed = await bcrypt.hash(newPassword, 10);
      admin.password = hashed;
    }

    await admin.save();
    return res.json({ ok: true, message: 'Settings updated' });
  } catch (err) {
    console.error('admin.updateSettings error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export default { updateSettings };
