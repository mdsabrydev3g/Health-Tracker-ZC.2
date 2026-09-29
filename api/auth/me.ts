// GET /api/auth/me — بيانات المستخدم والعائلة (رمز الدعوة للمالك)

import { ensureSchema, getSql } from '../_lib/db';
import { requireAuth } from '../_lib/auth';
import { handler, json } from '../_lib/http';

export default handler(async (req) => {
  await ensureSchema();
  const ctx = await requireAuth(req);
  const q = getSql();
  const fam = await q`SELECT id, name, tz, invite_code FROM families WHERE id = ${ctx.familyId}`;
  const me = await q`SELECT id, family_id, login, name, role, person_id FROM users WHERE id = ${ctx.userId}`;
  const u = me[0];
  if (!u) return json(req, 401, { error: 'الحساب غير موجود.' });
  const f = fam[0];
  const out: Record<string, unknown> = {
    id: String(u.id),
    familyId: String(u.family_id),
    login: String(u.login),
    name: String(u.name),
    role: String(u.role),
    personId: u.person_id ? String(u.person_id) : undefined,
  };
  if (f && String(u.role) === 'owner') {
    out.family = {
      id: String(f.id),
      name: String(f.name),
      tz: String(f.tz),
      inviteCode: String(f.invite_code),
    };
  } else if (f) {
    out.family = { id: String(f.id), name: String(f.name), tz: String(f.tz) };
  }
  return json(req, 200, out);
});
