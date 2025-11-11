import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import UserController from '../controllers/userController';
import dotenv from 'dotenv';
dotenv.config();


const prisma = new PrismaClient();
const router: Router = Router();

// router.get('/users', authMiddleware, async (req: AuthRequest, res: Response) => {
//   try {
//     const users = await prisma.user.findMany({  select: {
//     id: true,
//     email: true,
//     createdAt: true,
//   },});
//     res.json(users);
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to fetch users' });
//   }
// });
router.post('/registration', UserController.registration);
router.post('/login', UserController.login);
router.get('/refresh_token', UserController.refresh);
router.post('/logout', UserController.logout);


export default router;