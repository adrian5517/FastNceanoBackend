import Student from '../models/Student.js';
import Visit from '../models/Visit.js';
import QRCode from 'qrcode';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import dotenv from 'dotenv';

// Ensure environment variables from .env are loaded when this module initializes.
// server.js also calls dotenv.config(), but imports may run before server.js executes,
// so load here to guarantee CLOUDINARY_API_KEY / SECRET are available.
dotenv.config();

// Configure Cloudinary using environment variables. CLOUDINARY_URL will also work.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const getStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching student' });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const updates = { ...(req.body || {}) };
    // Normalize middleName to middleInitial if provided
    if (updates.middleName) {
      const m = String(updates.middleName || '').trim();
      updates.middleInitial = m ? m.charAt(0).toUpperCase() + '.' : '';
    }
    const student = await Student.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: 'Error updating student' });
  }
};

export const createStudent = async (req, res) => {
  try {
    const { studentNo, firstName, middleName, lastName, suffix, course, level } = req.body;
    if (!firstName || !lastName || !course || !level) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    let finalStudentNo = studentNo && String(studentNo).trim();

    // If no studentNo provided, auto-generate using pattern SYY-DDMMNN
    // Example: S25-281101 => S25 - day(28) month(11) seq(01)
    if (!finalStudentNo) {
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');

      // Count how many students were created today to generate a daily sequence
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfNext = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const todaysCount = await Student.countDocuments({ createdAt: { $gte: startOfDay, $lt: startOfNext } });
      const seq = String(todaysCount + 1).padStart(2, '0');

      finalStudentNo = `S${yy}-${dd}${mm}${seq}`;
    } else {
      finalStudentNo = String(finalStudentNo);
    }

    // ensure unique studentNo
    const exists = await Student.findOne({ studentNo: finalStudentNo });
    if (exists) return res.status(409).json({ message: 'Student with this number already exists' });

    // create student record
    // compute middle initial if middleName provided
    const middleInitial = middleName && String(middleName).trim() ? String(middleName).trim().charAt(0).toUpperCase() + '.' : undefined;
    const student = new Student({ studentNo: finalStudentNo, firstName, middleName, middleInitial, lastName, suffix, course, level });
    await student.save();

    // Generate a QR payload (we'll encode the student id and studentNo)
    const payload = JSON.stringify({ id: student._id.toString(), studentNo: student.studentNo });
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 300 });

    student.qrCode = qrDataUrl;
    // If a file was uploaded in the same request (multipart/form-data), upload it to Cloudinary now
    if (req.file && req.file.buffer) {
      try {
        const mime = req.file.mimetype || 'image/png';
        const b64 = req.file.buffer.toString('base64');
        const dataUri = `data:${mime};base64,${b64}`;
        const publicId = `students/${student.studentNo || student._id}`;
        const uploadResult = await cloudinary.uploader.upload(dataUri, {
          folder: 'students',
          public_id: publicId,
          overwrite: true,
          resource_type: 'image',
          transformation: [{ width: 800, height: 800, crop: 'limit' }],
        });
        if (uploadResult && uploadResult.secure_url) {
          student.photo = uploadResult.secure_url;
        } else {
          console.error('Cloudinary upload failed during createStudent', uploadResult);
        }
      } catch (err) {
        console.error('Error uploading photo during createStudent', err);
      }
    }

    await student.save();

    res.status(201).json(student);
  } catch (err) {
    console.error('createStudent error', err);
    res.status(500).json({ message: 'Error creating student' });
  }
};

export const getStudentQR = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const { qrCode } = student;
    if (!qrCode) return res.status(404).json({ message: 'QR not found' });

    // qrCode is expected to be a data URL like 'data:image/png;base64,...'
    const match = qrCode.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!match) return res.status(500).json({ message: 'Invalid QR format' });
    const mime = match[1];
    const b64 = match[2];
    const buffer = Buffer.from(b64, 'base64');
    res.set('Content-Type', mime);
    res.send(buffer);
  } catch (err) {
    console.error('getStudentQR error', err);
    res.status(500).json({ message: 'Error retrieving QR' });
  }
};

export const listStudents = async (req, res) => {
  try {
    const students = await Student.find().sort({ lastName: 1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: 'Error listing students' });
  }
};

export const getStudentHistory = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).lean();
    if (!student) return res.status(404).json({ message: 'Student not found' });
    // Support pagination, search and sorting
    const limit = Math.max(1, parseInt(req.query.limit || '20', 10));
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const q = (req.query.q || '').trim();
    const sortBy = String(req.query.sortBy || 'timeIn');
    const sortOrder = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const skip = (page - 1) * limit;
    const sortField = sortBy === 'timeOut' ? 'timeOut' : 'timeIn';

    const filter = { studentId: student._id };
    if (q) {
      // search within purpose or notes
      filter.$or = [{ purpose: { $regex: q, $options: 'i' } }, { notes: { $regex: q, $options: 'i' } }];
    }

    const total = await Visit.countDocuments(filter).exec();
    const rows = await Visit.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit).lean().exec();

    const normalized = rows.map(v => ({
      _id: v._id,
      timeIn: v.timeIn,
      timeOut: v.timeOut,
      purpose: v.purpose,
      status: v.status,
      deviceId: v.deviceId,
      kiosk: v.kiosk,
      notes: v.notes,
      student: student
    }));

    const totalPages = Math.max(1, Math.ceil(total / limit));
    res.json({ visits: normalized, page, limit, total, totalPages, hasMore: page < totalPages });
  } catch (err) {
    console.error('getStudentHistory error', err);
    res.status(500).json({ message: 'Error fetching history' });
  }
};

// Return the next available student number without creating a record
export const generateStudentNo = async (req, res) => {
  try {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfNext = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // Count today's students to propose a sequence, then bump if collision
    let todaysCount = await Student.countDocuments({ createdAt: { $gte: startOfDay, $lt: startOfNext } });
    let seq = todaysCount + 1;
    let finalStudentNo = `S${yy}-${dd}${mm}${String(seq).padStart(2, '0')}`;

    // ensure uniqueness by incrementing sequence if necessary
    let attempts = 0;
    while (await Student.findOne({ studentNo: finalStudentNo })) {
      attempts += 1;
      seq += 1;
      finalStudentNo = `S${yy}-${dd}${mm}${String(seq).padStart(2, '0')}`;
      if (attempts > 1000) break; // safety
    }

    res.json({ studentNo: finalStudentNo });
  } catch (err) {
    console.error('generateStudentNo error', err);
    res.status(500).json({ message: 'Error generating student number' });
  }
};

// Upload and save a student's photo (expects { photo: 'data:image/...' })
export const uploadStudentPhoto = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    // Support multipart/form-data uploads (req.file) and fallback to JSON body with data-URL or external URL
    // 1) If a file was uploaded via multer (memory storage), convert buffer to data URI and upload to Cloudinary
    if (req.file && req.file.buffer) {
      const mime = req.file.mimetype || 'image/png';
      const b64 = req.file.buffer.toString('base64');
      const dataUri = `data:${mime};base64,${b64}`;

      const publicId = `students/${student.studentNo || student._id}`;
      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: 'students',
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        transformation: [{ width: 800, height: 800, crop: 'limit' }],
      });

      if (!uploadResult || !uploadResult.secure_url) {
        console.error('Cloudinary upload failed', uploadResult);
        return res.status(500).json({ message: 'Failed to upload photo to Cloudinary' });
      }

      student.photo = uploadResult.secure_url;
      await student.save();
      return res.json(student);
    }

    // 2) Otherwise check for a JSON body (either external URL or data URL)
    const { photo } = req.body || {};
    if (!photo) return res.status(400).json({ message: 'Photo missing' });

    // If photo already looks like an external URL, just save it
    if (/^https?:\/\//i.test(photo)) {
      student.photo = photo;
      await student.save();
      return res.json(student);
    }

    // Expecting a data URL like 'data:image/png;base64,...'
    const match = String(photo).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ message: 'Invalid photo format. Expected data URL or file upload.' });
    const mime2 = match[1];
    const b642 = match[2];
    const dataUri2 = `data:${mime2};base64,${b642}`;

    const publicId2 = `students/${student.studentNo || student._id}`;
    const uploadResult2 = await cloudinary.uploader.upload(dataUri2, {
      folder: 'students',
      public_id: publicId2,
      overwrite: true,
      resource_type: 'image',
      transformation: [{ width: 800, height: 800, crop: 'limit' }],
    });

    if (!uploadResult2 || !uploadResult2.secure_url) {
      console.error('Cloudinary upload failed', uploadResult2);
      return res.status(500).json({ message: 'Failed to upload photo to Cloudinary' });
    }

    student.photo = uploadResult2.secure_url;
    await student.save();
    return res.json(student);
  } catch (err) {
    console.error('uploadStudentPhoto error', err);
    res.status(500).json({ message: 'Error saving photo' });
  }
};
