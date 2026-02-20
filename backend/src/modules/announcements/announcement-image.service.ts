import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AnnouncementImageService {
  private readonly uploadPath = path.join(process.cwd(), 'uploads', 'announcements');

  constructor() {
    fs.ensureDirSync(this.uploadPath);
  }

  async optimizeAndSave(fileBuffer: Buffer): Promise<string> {
    const filename = `${uuidv4()}.webp`;
    const fullPath = path.join(this.uploadPath, filename);

    await sharp(fileBuffer)
      .resize(1600, 1600, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toFile(fullPath);

    return `/uploads/announcements/${filename}`;
  }

  async optimizeAndSaveMany(fileBuffers: Buffer[]): Promise<string[]> {
    const savedPaths: string[] = [];
    for (const fileBuffer of fileBuffers) {
      const savedPath = await this.optimizeAndSave(fileBuffer);
      savedPaths.push(savedPath);
    }
    return savedPaths;
  }
}
