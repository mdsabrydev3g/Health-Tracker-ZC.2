// POST /api/auth/register — إنشاء عائلة جديدة + مالك + شخص له.

import { randomBytes } from 'node:crypto';
import { ensureSchema, getSql, audit } from '../_lib/db';
import { hashPassword, signAccess, signRefresh } from '../_lib/auth';
import { handler, json, readJson, httpError } from '../_lib/http';

interface Body {
  familyName: string;
  login: string;
  password: string;
  name: string;
}

export default handler(async (req) => {
  if (req.method !== 'POST') throw httpError(405, 'طريقة غير مدعومة.');
  await ensureSchema();
  const body = await readJson<Body>(req);
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
  // شخص افتراضي للمالك
  await q`INSERT INTO persons (id, family_id, server_seq, data, updated_at)
          VALUES (${personId}, ${familyId}, 0, ${JSON.stringify({
            id: personId, familyId, name: body.name || 'أنا', role: 'owner', createdAt: now, updatedAt: now, serverSeq: 0,
          })}, ${now})`;
  await audit(familyId, userId, 'register', 'family', familyId);

  return json(req, 200, {
    user: { id: userId, familyId, login: body.login, name: body.name || body.login, role: 'owner', personId },
    family: { id: familyId, name: body.familyName || 'عائلتي', inviteCode },
    tokens: {
      accessToken: await signAccess(userId, familyId, 'owner'),
      refreshToken: await signRefresh(userId, familyId),
    },
  });
});
