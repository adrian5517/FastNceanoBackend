import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../models/Student.js';

dotenv.config();

const MONGODB = process.env.MONGODB_URI || 'mongodb://localhost:27017/fastnceano';

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected.');

    // Find students that have a middleName but no middleInitial
    const query = {
      middleName: { $exists: true, $ne: '' },
      $or: [ { middleInitial: { $exists: false } }, { middleInitial: null }, { middleInitial: '' } ]
    };

    const cursor = Student.find(query).cursor();
    let count = 0;
    for await (const doc of cursor) {
      try {
        const m = String(doc.middleName || '').trim();
        if (!m) continue;
        const initial = m.charAt(0).toUpperCase() + '.';
        doc.middleInitial = initial;
        await doc.save();
        console.log(`Updated ${doc.studentNo} -> middleInitial='${initial}'`);
        count += 1;
      } catch (err) {
        console.error('Error updating doc', doc._id, err);
      }
    }

    console.log(`Backfilled middleInitial for ${count} students.`);
    await mongoose.disconnect();
    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed', err);
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(1);
  }
};

run();
