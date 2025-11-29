import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  studentNo: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  middleName: { type: String },
  middleInitial: { type: String },
  lastName: { type: String, required: true },
  suffix: { type: String },
  course: { type: String, required: true },
  level: { type: String, required: true },
  qrCode: { type: String },
  photo: { type: String },
  visits: [{
    timeIn: Date,
    timeOut: Date,
    purpose: String,
    status: String,
  }],
}, { timestamps: true });

export default mongoose.model('Student', studentSchema);
