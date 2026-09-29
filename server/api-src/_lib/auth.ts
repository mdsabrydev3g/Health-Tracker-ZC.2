// api/_lib/auth — scrypt لكلمات المرور + JWT (jose) + حماية المسارات.

import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { VReq } from './http';

export interface AuthCtx {
  userId: string;
  familyId: string;
  role: string;
  login: string;
}

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('AUTH_SECRET غير مضبوط — ولّد مفتاحاً عشوائياً طويلاً واضبطه في متغيرات البيئة.');
  }
  return new TextEncoder().encode(s);
}

/** hash بصيغة scrypt$N$salt$hash */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const h = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const h = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(hashHex, 'hex');
    return h.length === expected.length && timingSafeEqual(h, expected);
  } catch {
    return false;
  }
}

export async function signAccess(userId: string, familyId: string, role: string): Promise<string> {
  return new SignJWT({ sub: userId, fam: familyId, role, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secretKey());
}

export async function signRefresh(userId: string, familyId: string): Promise<string> {
  return new SignJWT({ sub: userId, fam: familyId, typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('60d')
    .sign(secretKey());
}

export async function verifyToken(token: string, type: 'access' | 'refresh'): Promise<{ sub: string; fam: string; role?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== type) return null;
    return { sub: String(payload.sub), fam: String(payload.fam), role: payload.role as string | undefined };
  } catch {
    return null;
  }
}

/** يستخرج ويتحقق من Bearer token — يرمي خطأ 401 عند الفشل */
export async function requireAuth(req: VReq): Promise<AuthCtx> {
  const raw = req.headers['authorization'] ?? '';
  const header = Array.isArray(raw) ? raw[0] ?? '' : raw;
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw httpError(401, 'مطلوب تسجيل دخول.');
  const payload = await verifyToken(token, 'access');
  if (!payload) throw httpError(401, 'الجلسة منتهية — سجّل الدخول من جديد.');
  return {
    userId: payload.sub,
    familyId: payload.fam,
    role: payload.role ?? 'member',
    login: '',
  };
}

export function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}
