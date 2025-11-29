import express from 'express';
import { getMonitorStats, getTimedInStudents, getAllStudentsByDate } from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/monitor-stats', getMonitorStats);
router.get('/timed-in-students', getTimedInStudents);
router.get('/all-students-by-date', getAllStudentsByDate);

export default router;
