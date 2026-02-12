import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected getTracker(req: {
    headers?: Record<string, string | string[] | undefined>;
    ips?: string[];
    ip?: string;
  }): Promise<string> {
    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim().length > 0) {
      return Promise.resolve(xff.split(',')[0]?.trim() ?? req.ip);
    }

    if (Array.isArray(req.ips) && req.ips.length > 0) {
      return Promise.resolve(req.ips[0]);
    }

    return Promise.resolve(req.ip ?? 'unknown');
  }
}
