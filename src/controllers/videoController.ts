import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';


const prisma = new PrismaClient();

export interface LinePoint {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MaskPoint {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CreateVideoRequest {
  title: string;
  description?: string;
  lines: LinePoint[];
  masks: MaskPoint[];
}

export interface VideoResponse {
  id: number;
  title: string;
  description?: string;
  filePath: string;
  createdAt: Date;
  lines: LinePoint[];
  masks: MaskPoint[];
}

class VideoController {
  // Создание нового видео с масками и линиями
  async createVideo(req: Request, res: Response) {
    try {
      console.log('Request body:', req.body);
      console.log('Request file:', req.file);

      if (!req.file) {
        return res.status(400).json({ 
          error: 'Видео файл обязателен. Убедитесь, что поле называется "video"' 
        });
      }

      const { title, description, lines, masks } = req.body;
      
      // Валидация обязательных полей
      if (!title) {
        return res.status(400).json({ error: 'Название видео обязательно' });
      }

      if (!lines) {
        return res.status(400).json({ error: 'Линии обязательны' });
      }

      if (!masks) {
        return res.status(400).json({ error: 'Маски обязательны' });
      }

      // Безопасный парсинг JSON
      let linesData: any[] = [];
      let masksData: any[] = [];

      try {
        linesData = typeof lines === 'string' ? JSON.parse(lines) : lines;
        masksData = typeof masks === 'string' ? JSON.parse(masks) : masks;
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        return res.status(400).json({ 
          error: 'Неверный формат JSON в lines или masks',
          details: parseError instanceof Error ? parseError.message : 'Unknown error'
        });
      }

      // Проверяем, что данные являются массивами
      if (!Array.isArray(linesData)) {
        return res.status(400).json({ error: 'Lines должен быть массивом' });
      }

      if (!Array.isArray(masksData)) {
        return res.status(400).json({ error: 'Masks должен быть массивом' });
      }

      console.log('Lines data:', linesData);
      console.log('Masks data:', masksData);

      // Создаем видео с защитой от пустых массивов
      const video = await prisma.video.create({
        data: {
          title: title.trim(),
          description: description ? description.trim() : null,
          filePath: req.file.path,
          userId: 1,
          lines: {
            create: linesData.length > 0 ? linesData.map((line: any) => ({
              type: line.type || 'Вход',
              points: line
            })) : [] // Если массив пустой, создаем пустой массив
          },
          masks: {
            create: masksData.length > 0 ? masksData.map((mask: any) => ({
              points: mask
            })) : [] // Если массив пустой, создаем пустой массив
          }
        },
        include: {
          lines: true,
          masks: true
        }
      });

      res.status(201).json({
        message: 'Видео успешно загружено',
        video: {
          id: video.id,
          title: video.title,
          description: video.description,
          filePath: video.filePath,
          lines: video.lines.map(line => line.points),
          masks: video.masks.map(mask => mask.points)
        }
      });
    } catch (error) {
      console.error('Error creating video:', error);
      res.status(500).json({ 
        error: 'Ошибка при создании видео',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Получение информации о видео по ID
   async getVideoById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const video = await prisma.video.findUnique({
        where: { id: parseInt(id) },
        include: {
          lines: true,
          masks: true
        }
      });

      if (!video) {
        return res.status(404).json({ error: 'Видео не найдено' });
      }

      const response: VideoResponse = {
        id: video.id,
        title: video.title,
        description: video.description || undefined,
        filePath: video.filePath,
        createdAt: video.createdAt,
        lines: video.lines.map(line => line.points as any),
        masks: video.masks.map(mask => mask.points as any)
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching video:', error);
      res.status(500).json({ error: 'Ошибка при получении видео' });
    }
  }

  // Получение всех видео
   async getAllVideos(req: Request, res: Response) {
    try {
      const videos = await prisma.video.findMany({
        include: {
          lines: true,
          masks: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const response: VideoResponse[] = videos.map(video => ({
        id: video.id,
        title: video.title,
        description: video.description || undefined,
        filePath: video.filePath,
        createdAt: video.createdAt,
        lines: video.lines.map(line => line.points as any),
        masks: video.masks.map(mask => mask.points as any)
      }));

      res.json(response);
    } catch (error) {
      console.error('Error fetching videos:', error);
      res.status(500).json({ error: 'Ошибка при получении видео' });
    }
  }

  // Удаление видео
   async deleteVideo(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.video.delete({
        where: { id: parseInt(id) }
      });

      res.json({ message: 'Видео успешно удалено' });
    } catch (error) {
      console.error('Error deleting video:', error);
      res.status(500).json({ error: 'Ошибка при удалении видео' });
    }
  }
  
}

export default new VideoController();
