import express from 'express';
import { scanAttendance, timeIn, timeOut, recentVisits } from '../controllers/attendanceController.js';

const router = express.Router();

router.post('/scan', scanAttendance);
router.post('/time-in', timeIn);
router.post('/time-out', timeOut);
router.get('/recent', recentVisits);

export default router;
