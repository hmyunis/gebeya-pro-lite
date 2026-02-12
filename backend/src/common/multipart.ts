import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export type MultipartFileLike = {
  type: 'file';
  fieldname: string;
  filename?: string;
  mimetype?: string;
  file?: AsyncIterable<unknown> & {
    truncated?: boolean;
    resume?: () => void;
  };
};

export type MultipartFieldLike = {
  type: 'field';
  fieldname: string;
  value: unknown;
};

export type MultipartPartLike = MultipartFileLike | MultipartFieldLike;

export function assertMultipartRequest(
  req: FastifyRequest,
  message = 'Expected multipart/form-data',
) {
  const contentType = String(req.headers['content-type'] ?? '');
  if (!contentType.includes('multipart/form-data')) {
    throw new BadRequestException(message);
  }
}

export async function readMultipartFileToBuffer(
  part: MultipartFileLike,
  options: {
    maxBytes: number;
    allowedMimePrefixes?: string[];
    errorLabel?: string;
  },
): Promise<Buffer> {
  const {
    maxBytes,
    allowedMimePrefixes = [],
    errorLabel = 'Uploaded file',
  } = options;

  const mime = String(part.mimetype ?? '').toLowerCase();
  if (
    allowedMimePrefixes.length > 0 &&
    !allowedMimePrefixes.some((prefix) => mime.startsWith(prefix))
  ) {
    throw new BadRequestException(
      `${errorLabel} must match: ${allowedMimePrefixes.join(', ')}`,
    );
  }

  if (!part.file) {
    throw new BadRequestException(`${errorLabel} stream is missing`);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of part.file) {
    const next = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as ArrayBuffer);
    totalBytes += next.length;
    if (totalBytes > maxBytes) {
      await drainMultipartFile(part);
      throw new PayloadTooLargeException(
        `${errorLabel} exceeds ${(maxBytes / (1024 * 1024)).toFixed(0)}MB`,
      );
    }
    chunks.push(next);
  }

  if (part.file.truncated) {
    throw new PayloadTooLargeException(`${errorLabel} is too large`);
  }

  return Buffer.concat(chunks, totalBytes);
}

export function coerceMultipartFieldValue(
  value: unknown,
  fieldName: string,
  maxBytes = 10_000,
): string {
  const normalized = stringifyMultipartFieldValue(value);
  if (Buffer.byteLength(normalized, 'utf8') > maxBytes) {
    throw new PayloadTooLargeException(
      `Field "${fieldName}" exceeds ${maxBytes} bytes`,
    );
  }
  return normalized;
}

export async function drainMultipartFile(
  part: MultipartFileLike,
): Promise<void> {
  if (!part.file) return;

  try {
    for await (const chunk of part.file) {
      // drain stream
      void chunk;
    }
  } catch {
    part.file.resume?.();
  }
}

export function getMultipartParts(
  req: FastifyRequest,
): AsyncIterable<MultipartPartLike> | null {
  const requestWithParts = req as FastifyRequest & {
    parts?: () => AsyncIterable<MultipartPartLike>;
  };
  return typeof requestWithParts.parts === 'function'
    ? requestWithParts.parts()
    : null;
}

export function getRequestBodyRecord(
  req: FastifyRequest,
): Record<string, unknown> {
  const requestWithBody = req as FastifyRequest & { body?: unknown };
  const body = requestWithBody.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function stringifyMultipartFieldValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}
