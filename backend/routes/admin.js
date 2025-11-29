import express from 'express';
import { updateSettings } from '../controllers/adminController.js';
import { verifyToken } from '../controllers/authController.js';

const router = express.Router();

// PATCH /api/admin/settings
router.patch('/settings', verifyToken, updateSettings);

export default router;
