import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import tokenService from '../service/tokenService';


class UserService {
  async register(email: string, password: string) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
       throw new Error(`USER_ALREADY_EXISTS:${email}`);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    const userWithoutPassword = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        createdAt: true,
      }
    });

    const tokens = tokenService.generateTokens({userId:user.id, email:user.email})//Поменять на userWithoutPassword ///////////////////////////////////
    return  {...tokens, user:userWithoutPassword} ;
  }


  async login(email: string, password: string) {

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error(`USER_DONT_EXISTS:${email}`);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error(`INVALID_CREDENTIALS`);
    }
    
    const userWithoutPassword = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        createdAt: true,
      }
    });

    const tokens = tokenService.generateTokens({userId:user.id, email:user.email})
    return  {...tokens, user:userWithoutPassword} ;
  }
}

export default new UserService();