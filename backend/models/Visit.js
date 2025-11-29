import mongoose from 'mongoose';

const visitSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  timeIn: { type: Date, required: true, index: true },
  timeOut: { type: Date, index: true },
  purpose: { type: String },
  status: { type: String },
  deviceId: { type: String },
  kiosk: { type: String },
  notes: { type: String },
}, { timestamps: true });

visitSchema.index({ studentId: 1, timeIn: -1 });
visitSchema.index({ timeIn: -1 });
visitSchema.index({ timeOut: -1 });

export default mongoose.model('Visit', visitSchema);
