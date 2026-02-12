import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsObject,
  IsString,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AdStatus } from '../entities/ad.entity';

function toNumberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value);
  return undefined;
}

function toIntOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'null') return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function toOptionalObject(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function toBooleanValue(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return undefined;
}

function toUpperEnumValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).toUpperCase();
  }
  return undefined;
}

export class UpdateAdDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Transform(({ value }: { value: unknown }) => toNumberValue(value))
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @Transform(({ value }: { value: unknown }) => toNumberValue(value))
  @IsNumber()
  @IsOptional()
  categoryId?: number;

  @Transform(({ value }: { value: unknown }) => toIntOrNull(value))
  @IsNumber()
  @IsOptional()
  merchantId?: number | null;

  @Transform(({ value }: { value: unknown }) => toBooleanValue(value))
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @Transform(({ value }: { value: unknown }) => toOptionalObject(value))
  @IsObject()
  @IsOptional()
  itemDetails?: Record<string, unknown>;

  @Transform(({ value }: { value: unknown }) => toUpperEnumValue(value))
  @IsEnum(AdStatus)
  @IsOptional()
  status?: AdStatus;

  @IsString()
  @IsOptional()
  moderationNote?: string;
}
