import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ImageService {
  // Save inside the project folder
  private readonly uploadPath = path.join(process.cwd(), 'uploads', 'ads');

  constructor() {
    // Ensure directory exists on startup
    fs.ensureDirSync(this.uploadPath);
  }

  async optimizeAndSave(fileBuffer: Buffer): Promise<string> {
    const filename = `${uuidv4()}.webp`;
    const fullPath = path.join(this.uploadPath, filename);

    await sharp(fileBuffer)
      .resize(800, 800, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(fullPath);

    return `/uploads/ads/${filename}`;
  }

  async optimizeAndSaveMany(fileBuffers: Buffer[]): Promise<string[]> {
    const savedPaths: string[] = [];
    for (const fileBuffer of fileBuffers) {
      const savedPath = await this.optimizeAndSave(fileBuffer);
      savedPaths.push(savedPath);
    }
    return savedPaths;
  }

  async deleteImage(relativePath: string): Promise<void> {
    if (!relativePath) return;
    const fullPath = path.join(process.cwd(), relativePath);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
    }
  }

  async deleteImages(relativePaths: string[]): Promise<void> {
    const uniquePaths = [...new Set(relativePaths.filter(Boolean))];
    for (const relativePath of uniquePaths) {
      await this.deleteImage(relativePath);
    }
  }
}
