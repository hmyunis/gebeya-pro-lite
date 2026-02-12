import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import slugify from 'slugify';
import { type FastifyRequest } from 'fastify';
import { Category, CategoryDynamicField } from './entities/category.entity';
import { AuthGuard } from '@nestjs/passport';
import {
  buildPaginationMeta,
  normalizePagination,
} from '../../common/pagination';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ImageService } from './image.service';
import {
  getMultipartParts,
  getRequestBodyRecord,
  readMultipartFileToBuffer,
} from '../../common/multipart';

const MAX_CATEGORY_THUMBNAIL_BYTES = 8 * 1024 * 1024;
const MAX_CATEGORY_MULTIPART_FIELDS = 12;

@Controller('categories')
export class CategoriesController {
  constructor(
    @InjectRepository(Category)
    private readonly catRepo: Repository<Category>,
    private readonly imageService: ImageService,
  ) {}

  @Get()
  async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const {
      page: safePage,
      limit: safeLimit,
      skip,
    } = normalizePagination(page, limit);

    const query = this.catRepo
      .createQueryBuilder('category')
      .loadRelationCountAndMap('category.productCount', 'category.ads')
      .orderBy('category.createdAt', 'DESC')
      .skip(skip)
      .take(safeLimit);

    const [data, total] = await query.getManyAndCount();
    return { data, meta: buildPaginationMeta(total, safePage, safeLimit) };
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  async create(@Req() req: FastifyRequest) {
    const { body, thumbnailBuffer } = await this.parseMultipartOrJson(req);
    const name = this.toTrimmedString(body.name);
    if (!name) {
      throw new BadRequestException('Category name is required');
    }

    const slug = slugify(name, { lower: true, strict: true });
    const thumbnailUrl =
      thumbnailBuffer && thumbnailBuffer.length > 0
        ? await this.imageService.optimizeAndSave(thumbnailBuffer)
        : null;

    const cat = this.catRepo.create({
      name,
      slug,
      thumbnailUrl,
      dynamicFields: this.parseDynamicFields(body.dynamicFields),
    });
    return this.catRepo.save(cat);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ) {
    const category = await this.catRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const { body, thumbnailBuffer } = await this.parseMultipartOrJson(req);
    if (body.name !== undefined) {
      const nextName = this.toTrimmedString(body.name);
      if (!nextName) {
        throw new BadRequestException('Category name cannot be empty');
      }
      category.name = nextName;
      category.slug = slugify(nextName, { lower: true, strict: true });
    }

    if (body.dynamicFields !== undefined) {
      category.dynamicFields = this.parseDynamicFields(body.dynamicFields);
    }

    if (thumbnailBuffer && thumbnailBuffer.length > 0) {
      const previousThumbnail = category.thumbnailUrl ?? null;
      category.thumbnailUrl =
        await this.imageService.optimizeAndSave(thumbnailBuffer);
      if (previousThumbnail && previousThumbnail !== category.thumbnailUrl) {
        await this.imageService.deleteImage(previousThumbnail);
      }
    } else if (body.removeThumbnail === true) {
      const previousThumbnail = category.thumbnailUrl ?? null;
      category.thumbnailUrl = null;
      if (previousThumbnail) {
        await this.imageService.deleteImage(previousThumbnail);
      }
    }

    return this.catRepo.save(category);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const category = await this.catRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    await this.catRepo.remove(category);
    if (category.thumbnailUrl) {
      await this.imageService.deleteImage(category.thumbnailUrl);
    }
    return { success: true };
  }

  private parseDynamicFields(rawValue: unknown): CategoryDynamicField[] | null {
    if (rawValue === undefined || rawValue === null) {
      return null;
    }
    if (typeof rawValue === 'string' && rawValue.trim() === '') return null;

    let parsed: unknown = rawValue;
    if (typeof rawValue === 'string') {
      try {
        parsed = JSON.parse(rawValue);
      } catch {
        throw new BadRequestException('dynamicFields must be valid JSON');
      }
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('dynamicFields must be an array');
    }
    const parsedArray = parsed as unknown[];

    const normalized: CategoryDynamicField[] = parsedArray
      .map((entry) => (entry && typeof entry === 'object' ? entry : null))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) => {
        const key = this.toTrimmedString(entry.key);
        const label = this.toTrimmedString(entry.label);
        const type = this.toTrimmedString(
          entry.type,
        ) as CategoryDynamicField['type'];
        const required = Boolean(entry.required);
        const options = Array.isArray(entry.options)
          ? entry.options
              .map((value) => this.toTrimmedString(value))
              .filter(Boolean)
          : undefined;

        if (!key || !label) {
          throw new BadRequestException(
            'Each dynamic field needs non-empty key and label',
          );
        }
        if (!['text', 'number', 'select', 'boolean'].includes(type)) {
          throw new BadRequestException('Invalid dynamic field type');
        }
        if (type === 'select' && (!options || options.length === 0)) {
          throw new BadRequestException(
            'Select dynamic fields require at least one option',
          );
        }

        return { key, label, type, required, options };
      });

    return normalized.length > 0 ? normalized : null;
  }

  private async parseMultipartOrJson(req: FastifyRequest): Promise<{
    body: Record<string, unknown>;
    thumbnailBuffer?: Buffer;
  }> {
    const contentType = String(req.headers['content-type'] ?? '');
    if (!contentType.includes('multipart/form-data')) {
      return { body: getRequestBodyRecord(req) };
    }

    const parts = getMultipartParts(req);
    if (!parts) {
      throw new BadRequestException('Invalid multipart request');
    }

    const body: Record<string, unknown> = {};
    let thumbnailBuffer: Buffer | undefined;
    let fieldCount = 0;
    let thumbnailCount = 0;

    for await (const part of parts) {
      if (part.type === 'file') {
        const fieldname = part.fieldname ?? '';
        if (fieldname !== 'thumbnail') {
          throw new BadRequestException(`Unexpected file field "${fieldname}"`);
        }
        thumbnailCount += 1;
        if (thumbnailCount > 1) {
          throw new BadRequestException('Only one thumbnail is allowed');
        }

        const buffer = await readMultipartFileToBuffer(part, {
          maxBytes: MAX_CATEGORY_THUMBNAIL_BYTES,
          allowedMimePrefixes: ['image/'],
          errorLabel: 'Category thumbnail',
        });
        if (buffer.length > 0) {
          thumbnailBuffer = buffer;
        }
      } else {
        fieldCount += 1;
        if (fieldCount > MAX_CATEGORY_MULTIPART_FIELDS) {
          throw new BadRequestException('Too many multipart fields');
        }
        const value = part.value;
        if (part.fieldname === 'removeThumbnail') {
          const normalized = this.toTrimmedString(value).toLowerCase();
          body.removeThumbnail =
            normalized === 'true' || normalized === '1' || normalized === 'yes';
          continue;
        }
        body[part.fieldname] = this.toTrimmedString(value);
      }
    }

    return { body, thumbnailBuffer };
  }

  private toTrimmedString(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }
}
