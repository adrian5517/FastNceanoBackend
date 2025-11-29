import express from 'express';
import multer from 'multer';
import { getStudent, updateStudent, listStudents, createStudent, getStudentQR, generateStudentNo, uploadStudentPhoto, getStudentHistory } from '../controllers/studentsController.js';
import { verifyToken } from '../controllers/authController.js';

// Use memory storage for small image uploads; files will be kept in memory and streamed to Cloudinary
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB limit

const router = express.Router();

router.get('/', listStudents);
router.get('/generateNo', verifyToken, generateStudentNo);
// Accept multipart/form-data on create so clients can send a photo alongside fields
router.post('/', verifyToken, upload.single('photo'), createStudent);
router.post('/:id/photo', verifyToken, upload.single('photo'), uploadStudentPhoto);
router.get('/:id', getStudent);
router.get('/:id/history', getStudentHistory);
router.get('/:id/qr', verifyToken, getStudentQR);
router.patch('/:id', verifyToken, updateStudent);

export default router;
