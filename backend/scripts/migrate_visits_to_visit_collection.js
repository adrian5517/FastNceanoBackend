import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../models/Student.js';
import Visit from '../models/Visit.js';

dotenv.config();

const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/newfastnceano';

async function migrate() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to', MONGO);

  try {
    const students = await Student.find({ visits: { $exists: true, $ne: [] } }).lean().exec();
    console.log(`Found ${students.length} students with embedded visits`);

    let created = 0;
    for (const s of students) {
      const visits = s.visits || [];
      for (const v of visits) {
        const timeIn = v.timeIn ? new Date(v.timeIn) : null;
        if (!timeIn) continue;
        // Check if a Visit already exists for this student + timeIn
        const exists = await Visit.findOne({ studentId: s._id, timeIn }).lean().exec();
        if (exists) continue;
        const doc = new Visit({
          studentId: s._id,
          timeIn: timeIn,
          timeOut: v.timeOut ? new Date(v.timeOut) : undefined,
          purpose: v.purpose,
          status: v.status,
          deviceId: v.deviceId,
        });
        await doc.save();
        created += 1;
      }
    }

    console.log(`Migration complete. Created ${created} Visit documents.`);
  } catch (err) {
    console.error('Migration error', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
