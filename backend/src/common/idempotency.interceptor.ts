import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, from, of, switchMap, throwError } from 'rxjs';

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 5000;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface Entry { exp: number; promise: Promise<unknown> }

/**
 * `Idempotency-Key` sarlavhali yozuvchi so'rovlar natijasini 10 daqiqa xotirada saqlaydi.
 * Takror kalit kelsa — handler qayta ishlamaydi, avvalgi javob qaytariladi.
 * Xato bilan tugagan so'rovlar keshlanmaydi (qayta urinish mumkin).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly store = new Map<string, Entry>();

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers?.['idempotency-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key || !MUTATING.has(req.method)) return next.handle();

    this.sweep();
    const id = `${req.user?.id ?? req.user?.sub ?? 'anon'}|${req.method}|${req.originalUrl}|${key}`;
    const hit = this.store.get(id);
    if (hit && hit.exp > Date.now()) {
      return from(hit.promise).pipe(switchMap((v) => of(v)));
    }

    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });
    promise.catch(() => undefined);
    this.store.set(id, { exp: Date.now() + TTL_MS, promise });

    return next.handle().pipe(
      switchMap((v) => { resolve(v); return of(v); }),
      catchError((e) => { this.store.delete(id); reject(e); return throwError(() => e); }),
    );
  }

  private sweep() {
    if (this.store.size < MAX_ENTRIES) return;
    const now = Date.now();
    for (const [k, v] of this.store) if (v.exp <= now) this.store.delete(k);
    if (this.store.size >= MAX_ENTRIES) this.store.clear();
  }
}
