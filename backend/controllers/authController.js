import Admin from '../models/Admin.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// In-memory token blacklist (note: for production use persistent store)
const tokenBlacklist = new Set();

export const login = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const admin = await Admin.findOne({
      $or: [
        { username: username },
        { email: email },
        { email: username },
        { username: email },
      ],
    });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: admin._id, username: admin.username, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Server-side logout: blacklist token until it naturally expires
export const logout = (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(400).json({ message: 'No token provided' });

    // Decode token to determine expiry
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      // If no exp, add to blacklist for a short time (1 hour)
      tokenBlacklist.add(token);
      setTimeout(() => tokenBlacklist.delete(token), 1000 * 60 * 60);
      return res.json({ message: 'Logged out' });
    }

    // Calculate TTL and add to blacklist
    const expiresAtMs = decoded.exp * 1000;
    const ttl = Math.max(0, expiresAtMs - Date.now());
    tokenBlacklist.add(token);
    setTimeout(() => tokenBlacklist.delete(token), ttl);

    return res.json({ message: 'Logged out' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

// Middleware to verify token and check blacklist
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  if (tokenBlacklist.has(token)) return res.status(401).json({ message: 'Token revoked' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};
