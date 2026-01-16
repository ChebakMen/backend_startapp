import {  Request, Response } from 'express';
import userService from '../service/userService';
import tokenService from '../service/tokenService';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

class UserController {
  async registration(req: Request, res: Response) {
    try {
      console.log(req.body)
      const {email, password} = req.body
      const userData = await userService.register(email, password)

      res.cookie('jid', userData.refreshToken, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        path: '/', 
        sameSite: 'lax', 
      });

      res.status(200).json({ message: 'Пользователь создан', userInfo: userData.user, accessToken:userData.accessToken });
    } catch (e) {

      if (e instanceof Error && e.message.startsWith('USER_ALREADY_EXISTS:')) {
        const email = e.message.split(':')[1];

        console.error(`ERROR: Пользователь с ${email} уже существует`)
        res.status(400).json({ error: `Пользователь с ${email} уже существует` });
        return;
      }
      console.log(e)

      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }
  async login(req: Request, res: Response){
    try {
      const {email, password} = req.body
      const userData = await userService.login(email, password)

      res.cookie('jid', userData.refreshToken, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        path: '/', 
        sameSite: 'lax', 
      });

      res.status(200).json({ message: 'Пользователь авторизирован', userInfo: userData.user, accessToken:userData.accessToken });
    } catch (error) {

      if (error instanceof Error && error.message.startsWith('USER_DONT_EXISTS:')) {
        const email = error.message.split(':')[1];

        console.error(`ERROR: Пользователя с email:${email} не существует`)
        res.status(401).json({ error: `Пользователя с email:${email} не существует` });
        return;
      }

      if (error instanceof Error && error.message.startsWith('INVALID_CREDENTIALS')) {

        console.error(`ERROR: Неправерный email или пароль`)
        res.status(401).json({ error: `Неправерный email или пароль` });
        return;
      }
      console.log(error)

      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  }
  async refresh(req: Request, res: Response) {
    try {
      const token = req.cookies.jid; 

      if (!token) {
        console.error('ERROR: Refresh token не предоставлен');
        return res.status(401).json({ ok: false, accessToken: '' });
      }

      const refreshData = tokenService.refreshTokens(token);

      const user = await prisma.user.findUnique({
        where: { id: refreshData.payload.userId },
        select: {
          id: true,
          email: true,
          createdAt: true,
        }
      });

      if (!user) {
        console.error('ERROR: Пользователь не найден');
        return res.status(401).json({ ok: false, accessToken: '' });
      }

      res.cookie('jid', refreshData.refreshToken, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
        secure: process.env.NODE_ENV === 'production',
        path: '/refresh_token',
        sameSite: 'lax',
      });

      res.json({ 
        ok: true, 
        accessToken: refreshData.accessToken,
        userInfo: user 
      });

    } catch (error) {
      console.error('ERROR в refresh:', error);
      
      if (error instanceof Error && error.message === 'INVALID_REFRESH_TOKEN') {
        return res.status(401).json({ ok: false, accessToken: '' });
      }
      
      res.status(500).json({ ok: false, accessToken: '' });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      res.clearCookie('jid', {
        path: '/refresh_token',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });

      res.json({ ok: true, message: 'Выход выполнен успешно' });
    } catch (error) {
      console.error('ERROR в logout:', error);
      res.status(500).json({ ok: false, message: 'Ошибка при выходе' });
    }
  }
}

export default new UserController();