import type { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private maxRequests: number;
  private windowMs: number;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    this.cleanupInterval.unref(); // Don't prevent process exit
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.limits) {
      if (now >= entry.resetAt) {
        this.limits.delete(ip);
      }
    }
  }

  check(ip: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const entry = this.limits.get(ip);

    // No existing entry or window expired — allow
    if (!entry || now >= entry.resetAt) {
      this.limits.set(ip, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    // Within window — check count
    if (entry.count < this.maxRequests) {
      entry.count++;
      return { allowed: true, retryAfterMs: 0 };
    }

    // Rate limited
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const result = this.check(ip);

      if (!result.allowed) {
        const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
        res.set('Retry-After', String(retryAfterSec));
        res.status(429).json({
          error: 'Too many requests',
          retry_after_seconds: retryAfterSec,
        });
        return;
      }

      next();
    };
  }
}
