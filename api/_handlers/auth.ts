// api/_handlers/auth — منطق المصادقة الخمسة (يستدعيه auth/[action].ts)
// على النمط الكلاسيكي (req/res).

import { randomBytes } from 'node:crypto';
import { ensureSchema, getSql, audit } from '../_lib/db';
import { hashPassword, verifyPassword, signAccess, signRefresh, verifyToken } from '../_lib/auth';
import { json, readJson, httpError, type VReq, type VRes } from '../_lib/http';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(userId: string, familyId: string, role: string): Promise<Tokens> {
  return {
    accessToken: await signAccess(userId, familyId, role),
    refreshToken: await signRefresh(userId, familyId),
  };
}

/** POST /api/auth/register */
export async function handleRegister(req: VReq, res: VRes): Promise<void> {
  const body = await readJson<{ familyName: string; login: string; password: string; name: string }>(req);
  if (!body.login || !body.password || body.password.length < 8) {
    throw httpError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  }
  const q = getSql();
  const exists = await q`SELECT id FROM users WHERE login = ${body.login}`;
  if (exists.length) throw httpError(409, 'اسم الدخول مستخدم بالفعل.');

  const familyId = `fam_${randomBytes(8).toString('hex')}`;
  const userId = `usr_${randomBytes(8).toString('hex')}`;
  const personId = `prs_${randomBytes(8).toString('hex')}`;
  const inviteCode = randomBytes(4).toString('hex').toUpperCase();
  const now = Date.now();

  await q`INSERT INTO families (id, name, tz, invite_code, created_at)
          VALUES (${familyId}, ${body.familyName || 'عائلتي'}, ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo'}, ${inviteCode}, ${now})`;
  await q`INSERT INTO users (id, family_id, login, pass_hash, name, role, person_id, created_at)
          VALUES (${userId}, ${familyId}, ${body.login}, ${hashPassword(body.password)}, ${body.name || body.login}, 'owner', ${personId}, ${now})`;
  await q`INSERT INTO persons (id, family_id, server_seq, data, updated_at)
          VALUES (${personId}, ${familyId}, 0, ${JSON.stringify({
            id: personId, familyId, name: body.name || 'أنا', role: 'owner', createdAt: now, updatedAt: now, serverSeq: 0,
          })}, ${now})`;
  await audit(familyId, userId, 'register', 'family', familyId);

  json(req, res, 200, {
    user: { id: userId, familyId, login: body.login, name: body.name || body.login, role: 'owner', personId },
    family: { id: familyId, name: body.familyName || 'عائلتي', inviteCode },
    tokens: await issueTokens(userId, familyId, 'owner'),
  });
}

/** POST /api/auth/join */
export async function handleJoin(req: VReq, res: VRes): Promise<void> {
  const body = await readJson<{ inviteCode: string; login: string; password: string; name: string; role: 'mother' | 'member' }>(req);
  if (!body.inviteCode || !body.login || body.password.length < 8) {
    throw httpError(400, 'بيانات ناقصة أو كلمة المرور أقصر من 8 أحرف.');
  }
  const q = getSql();
  const fam = await q`SELECT id FROM families WHERE invite_code = ${body.inviteCode.trim().toUpperCase()}`;
  if (!fam.length) throw httpError(404, 'رمز الدعوة غير صحيح.');
  const familyId = String(fam[0].id);
  const exists = await q`SELECT id FROM users WHERE login = ${body.login}`;
  if (exists.length) throw httpError(409, 'اسم الدخول مستخدم بالفعل.');

  const userId = `usr_${randomBytes(8).toString('hex')}`;
  const personId = `prs_${randomBytes(8).toString('hex')}`;
  const now = Date.now();
  const role = body.role === 'mother' ? 'mother' : 'member';

  await q`INSERT INTO users (id, family_id, login, pass_hash, name, role, person_id, created_at)
          VALUES (${userId}, ${familyId}, ${body.login}, ${hashPassword(body.password)}, ${body.name || body.login}, ${role}, ${personId}, ${now})`;
  await q`INSERT INTO persons (id, family_id, server_seq, data, updated_at)
          VALUES (${personId}, ${familyId}, 0, ${JSON.stringify({
            id: personId, familyId, name: body.name || body.login, role, createdAt: now, updatedAt: now, serverSeq: 0,
          })}, ${now})`;
  await audit(familyId, userId, 'join', 'family', familyId);

  json(req, res, 200, {
    user: { id: userId, familyId, login: body.login, name: body.name || body.login, role, personId },
    tokens: await issueTokens(userId, familyId, role),
  });
}

/** POST /api/auth/login */
export async function handleLogin(req: VReq, res: VRes): Promise<void> {
  const { login, password } = await readJson<{ login: string; password: string }>(req);
  const q = getSql();
  const rows = await q`SELECT id, family_id, pass_hash, name, role, person_id FROM users WHERE login = ${login}`;
  const u = rows[0] as { id: string; family_id: string; pass_hash: string; name: string; role: string; person_id: string | null } | undefined;
  if (!u || !verifyPassword(password, u.pass_hash)) {
    throw httpError(401, 'اسم الدخول أو كلمة المرور غير صحيحة.');
  }
  json(req, res, 200, {
    user: { id: u.id, familyId: u.family_id, login, name: u.name, role: u.role, personId: u.person_id ?? undefined },
    tokens: await issueTokens(u.id, u.family_id, u.role),
  });
}

/** POST /api/auth/refresh */
export async function handleRefresh(req: VReq, res: VRes): Promise<void> {
  const { refreshToken } = await readJson<{ refreshToken: string }>(req);
  const payload = await verifyToken(refreshToken ?? '', 'refresh');
  if (!payload) throw httpError(401, 'انتهت صلاحية الجلسة — سجّل الدخول من جديد.');
  const q = getSql();
  const rows = await q`SELECT role FROM users WHERE id = ${payload.sub} AND family_id = ${payload.fam}`;
  if (!rows.length) throw httpError(401, 'الحساب غير موجود.');
  const role = String(rows[0].role);
  json(req, res, 200, { tokens: await issueTokens(payload.sub, payload.fam, role) });
}

/** GET /api/auth/me */
export async function handleMe(req: VReq, res: VRes): Promise<void> {
  const raw = req.headers['authorization'] ?? '';
  const header = Array.isArray(raw) ? raw[0] ?? '' : raw;
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = await verifyToken(token, 'access');
  if (!payload) throw httpError(401, 'الجلسة منتهية — سجّل الدخول من جديد.');
  const q = getSql();
  const fam = await q`SELECT id, name, tz, invite_code FROM families WHERE id = ${payload.fam}`;
  const me = await q`SELECT id, family_id, login, name, role, person_id FROM users WHERE id = ${payload.sub}`;
  const u = me[0];
  if (!u) throw httpError(401, 'الحساب غير موجود.');
  const f = fam[0];
  const out: Record<string, unknown> = {
    id: String(u.id),
    familyId: String(u.family_id),
    login: String(u.login),
    name: String(u.name),
    role: String(u.role),
    personId: u.person_id ? String(u.person_id) : undefined,
  };
  if (f) {
    out.family = {
      id: String(f.id),
      name: String(f.name),
      tz: String(f.tz),
      // رمز الدعوة يظهر للمالك فقط
      inviteCode: String(u.role) === 'owner' ? String(f.invite_code) : undefined,
    };
  }
  json(req, res, 200, out);
}
