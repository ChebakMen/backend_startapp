import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import VideoController from '../controllers/videoController';
import { upload } from '../middlewares/upload';
import dotenv from 'dotenv';
dotenv.config();


const prisma = new PrismaClient();
const router: Router = Router();

// Загрузка
router.post('/video', authMiddleware, upload.single('video'), VideoController.createVideo);

// Получение всех видео
router.get('/videos',authMiddleware, VideoController.getAllVideos);

// Получение видео по ID
router.get('/video/:id',authMiddleware, VideoController.getVideoById);

// Удаление видео
router.delete('/video/:id', authMiddleware, VideoController.deleteVideo);


export default router;