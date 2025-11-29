import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import Admin from './models/Admin.js';

dotenv.config();

const seedAdmin = async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
 

  const username = 'admin';
  const email = 'admin@fastnceano.com';
  const password = 'admin123'; // Change this after first login

  const hashedPassword = await bcrypt.hash(password, 10);

  const exists = await Admin.findOne({ username, email });
  if (exists) {
    console.log('Admin account already exists.');
    process.exit(0);
  }

  const admin = new Admin({ username, email, password: hashedPassword });
  await admin.save();
  console.log('Admin account created:', { username, email, password });
  process.exit(0);
};

seedAdmin();
