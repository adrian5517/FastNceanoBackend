import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admin.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fastnceano';

async function main() {
  const args = process.argv.slice(2);
  // Usage: node createAdmin.js --username admin --email admin@ncf.edu.ph --password secret
  const getArg = (name) => {
    const i = args.indexOf(`--${name}`);
    if (i >= 0 && args[i+1]) return args[i+1];
    return process.env[name?.toUpperCase()];
  };

  const username = getArg('username') || 'admin';
  const email = getArg('email') || 'admin@ncf.edu.ph';
  const password = getArg('password') || 'password123';

  console.log('Connecting to', MONGODB_URI);
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    const existing = await Admin.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      console.log('Admin already exists with that username or email. Updating password...');
      existing.password = await bcrypt.hash(password, 10);
      await existing.save();
      console.log('Updated existing admin:', existing.username, existing.email);
    } else {
      const hashed = await bcrypt.hash(password, 10);
      const admin = new Admin({ username, email, password: hashed });
      await admin.save();
      console.log('Created admin:', admin.username, admin.email);
    }
  } catch (err) {
    console.error('Error creating admin:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
