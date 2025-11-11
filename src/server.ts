import dotenv from 'dotenv';
dotenv.config();

import express, { Application, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { Client as SSHClient } from 'ssh2';
import { Client as PGClient, ClientConfig } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

import userRoutes from './routes/userRoutes';
import videoRoutes from './routes/videoRoutes';
import errorHandler from './middlewares/errorHandler';

const app: Application = express();

// Middleware
app.use(cors({
  credentials: true,
  origin: process.env.FRONT_URL
}));
app.use(cookieParser());
app.use(express.json());

const port: number = parseInt(process.env.PORT || '3000');

// Функция для нормализации пути к SSH ключу
const getSSHKeyPath = (): string | null => {
  if (!process.env.SSH_PRIVATE_KEY) {
    return null;
  }

  let keyPath = process.env.SSH_PRIVATE_KEY;

  // Заменяем Unix-стиль пути на Windows-стиль
  if (keyPath.startsWith('/Users/')) {
    keyPath = 'C:' + keyPath.replace(/\//g, '\\');
  }

  const resolvedPath = path.resolve(keyPath);
  
  // console.log('SSH key path:', {
  //   original: process.env.SSH_PRIVATE_KEY,
  //   resolved: resolvedPath,
  //   exists: fs.existsSync(resolvedPath)
  // });

  return resolvedPath;
};

// Конфигурация SSH
const getSSHConfig = () => {
  const baseConfig = {
    host: process.env.SSH_HOST || 'localhost',
    port: parseInt(process.env.SSH_PORT || '22'),
    username: process.env.SSH_USERNAME || 'user'
  };

  // Пытаемся найти SSH ключ
  const keyPath = getSSHKeyPath();
  
  if (keyPath && fs.existsSync(keyPath)) {
    try {
      console.log(`Using SSH key from: ${keyPath}`);
      
      const sshConfig: any = {
        ...baseConfig,
        privateKey: fs.readFileSync(keyPath)
      };

      // Добавляем passphrase если указан
      if (process.env.SSH_PASSPHRASE) {
        sshConfig.passphrase = process.env.SSH_PASSPHRASE;
        console.log('Using SSH key with passphrase');
      } else {
        console.log('Using SSH key without passphrase');
      }

      return sshConfig;
    } catch (error) {
      console.error('Error reading SSH key:', error);
    }
  }

  // Если ключ не найден, используем пароль
  if (process.env.SSH_PASSWORD) {
    console.log('Using SSH password authentication');
    return {
      ...baseConfig,
      password: process.env.SSH_PASSWORD
    };
  }

  console.warn('No SSH credentials found. Will use direct database connection.');
  return null;
};

// Конфигурация PostgreSQL
const dbConfig: ClientConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
};

let dbClient: PGClient | null = null;

// Функция для установки SSH соединения с БД
async function connectDatabase(): Promise<PGClient> {
  return new Promise((resolve, reject) => {
    const sshConfig = getSSHConfig();
    
    if (!sshConfig) {
      reject(new Error('SSH configuration not available'));
      return;
    }

    const sshClient = new SSHClient();
    
    console.log('Attempting SSH connection to:', sshConfig.host);
    
    sshClient.on('ready', () => {
      console.log('SSH connection established');
      
      sshClient.forwardOut(
        '127.0.0.1',
        0,
        dbConfig.host!,
        dbConfig.port!,
        (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          
          const clientConfig: ClientConfig = {
            ...dbConfig,
            stream: stream as any
          };
          
          const client = new PGClient(clientConfig);
          
          client.connect((err) => {
            if (err) {
              reject(err);
              return;
            }
            console.log('Database connected through SSH tunnel');
            dbClient = client;
            resolve(client);
          });
        }
      );
    });
    
    sshClient.on('error', (err) => {
      console.error('SSH connection error:', err);
      
      reject(err);
    });
    
    sshClient.connect(sshConfig);
  });
}

// Прямое подключение к БД (без SSH)
async function connectDatabaseDirect(): Promise<PGClient> {
  return new Promise((resolve, reject) => {
    console.log('Attempting direct database connection to:', dbConfig.host);
    
    const client = new PGClient(dbConfig);
    
    client.connect((err) => {
      if (err) {
        console.error('Direct database connection error:', err);
        reject(err);
        return;
      }
      console.log('Direct database connection established');
      dbClient = client;
      resolve(client);
    });
  });
}

// Middleware для БД
app.use(async (req: Request, res: Response, next) => {
  try {
    if (!dbClient) {
      const sshConfig = getSSHConfig();
      if (sshConfig && process.env.SSH_HOST && process.env.SSH_HOST !== 'localhost') {
        await connectDatabase();
      } else {
        await connectDatabaseDirect();
      }
    }
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    next();
  }
});

declare global {
  namespace Express {
    interface Request {
      dbClient?: PGClient | null;
    }
  }
}

app.use((req: Request, res: Response, next) => {
  req.dbClient = dbClient;
  next();
});

app.use('/api', userRoutes);
app.use('/api', videoRoutes);
app.use('/uploads', express.static('uploads'));
app.use(errorHandler);

app.get('/health', async (req: Request, res: Response) => {
  try {
    if (!dbClient) {
      return res.status(503).json({ 
        status: 'error', 
        message: 'Database not connected' 
      });
    }
    
    const result = await dbClient.query('SELECT NOW() as current_time');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      current_time: result.rows[0].current_time
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      message: 'Database health check failed'
    });
  }
});

app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'Server is running',
    database: dbClient ? 'connected' : 'disconnected',
    ssh_configured: !!(process.env.SSH_HOST && process.env.SSH_HOST !== 'localhost')
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  if (dbClient) {
    await dbClient.end();
    console.log('Database connection closed');
  }
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Инициализация с улучшенной обработкой ошибок
async function initializeApp() {
  try {
    console.log('Initializing application...');
    console.log('SSH Host:', process.env.SSH_HOST || 'not set');
    console.log('DB Host:', process.env.DB_HOST || 'localhost');
    
    const sshConfig = getSSHConfig();
    if (sshConfig && process.env.SSH_HOST && process.env.SSH_HOST !== 'localhost') {
      console.log('Attempting SSH database connection...');
      await connectDatabase();
    } else {
      console.log('Attempting direct database connection...');
      await connectDatabaseDirect();
    }
  } catch (error) {
    console.warn('Initial database connection failed:');
    if (error instanceof Error) {
      console.warn('Error message:', error.message);
      
    }
    console.warn('Server will start without database connection');
  }
  
  app.listen(port, () => {

    console.log(``);
    console.log(`🚀 Server is running on http://localhost:${port}`);
    console.log(`📊 Database: ${dbClient ? '✅ Connected' : '❌ Disconnected'}`);
    if (process.env.SSH_HOST && process.env.SSH_HOST !== 'localhost') {
      console.log(`🔐 SSH: ${dbClient ? '✅ Tunnel active' : '❌ Tunnel failed'}`);
    }
    console.log(``);

  });
}

initializeApp();

export { dbClient };