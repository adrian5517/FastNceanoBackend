import express from 'express';
import { exportAttendance } from '../controllers/exportController.js';

const router = express.Router();

router.get('/attendance', exportAttendance);

export default router;
