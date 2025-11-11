import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: number;
  email: string;
}

class TokenService {
  generateTokens(payload:TokenPayload){
        const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '15m' });
        const refreshToken = jwt.sign(payload, process.env.REFRESH_SECRET!, { expiresIn: '7d' });

        return {
          accessToken,
          refreshToken
        }
  }

  validateAccessToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    } catch (error) {
      return null;
    }
  }

  validateRefreshToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, process.env.REFRESH_SECRET!) as TokenPayload;
    } catch (error) {
      return null;
    }
  }

  refreshTokens(refreshToken: string) {
    try {
      const payload = this.validateRefreshToken(refreshToken);
      
      if (!payload) {
        throw new Error('INVALID_REFRESH_TOKEN');
      }

      const tokens = this.generateTokens({
        userId: payload.userId,
        email: payload.email
      });

      return {
        ...tokens,
        payload 
      };

    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('REFRESH_TOKEN_ERROR');
    }
  }
}

export default new TokenService();