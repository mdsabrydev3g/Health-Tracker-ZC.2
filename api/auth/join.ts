// POST /api/auth/join — الانضمام لعائلة برمز الدعوة (الوالدة أو عضو).

import { randomBytes } from 'node:crypto';
import { ensureSchema, getSql, audit } from '../_lib/db';
import { hashPassword, signAccess, signRefresh } from '../_lib/auth';
import { handler, json, readJson, httpError } from '../_lib/http';

interface Body {
  inviteCode: string;
  login: string;
  password: string;
  name: string;
  role: 'mother' | 'member';
}

export default handler(async (req) => {
  if (req.method !== 'POST') throw httpError(405, 'طريقة غير مدعومة.');
  await ensureSchema();
  const body = await readJson<Body>(req);
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
  // شخص خاص بالعضو الجديد (الوالدة تُبنى لها صفحتها الكاملة)
  await q`INSERT INTO persons (id, family_id, server_seq, data, updated_at)
          VALUES (${personId}, ${familyId}, 0, ${JSON.stringify({
            id: personId, familyId, name: body.name || body.login, role, createdAt: now, updatedAt: now, serverSeq: 0,
          })}, ${now})`;
  await audit(familyId, userId, 'join', 'family', familyId);

  return json(req, 200, {
    user: { id: userId, familyId, login: body.login, name: body.name || body.login, role, personId },
    tokens: {
      accessToken: await signAccess(userId, familyId, role),
      refreshToken: await signRefresh(userId, familyId),
    },
  });
});
