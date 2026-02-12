import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AvatarImageService {
  private readonly uploadPath = path.join(process.cwd(), 'uploads', 'avatars');

  constructor() {
    fs.ensureDirSync(this.uploadPath);
  }

  async optimizeAndSave(fileBuffer: Buffer): Promise<string> {
    const filename = `${uuidv4()}.webp`;
    const fullPath = path.join(this.uploadPath, filename);

    await sharp(fileBuffer)
      .resize(256, 256, {
        fit: 'cover',
      })
      .webp({ quality: 82 })
      .toFile(fullPath);

    return `/uploads/avatars/${filename}`;
  }

  async deleteAvatar(relativePath: string | null | undefined): Promise<void> {
    if (!relativePath) return;
    if (!relativePath.startsWith('/uploads/avatars/')) return;
    const fullPath = path.join(process.cwd(), relativePath);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
    }
  }
}
