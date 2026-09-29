// POST /api/auth/login

import { ensureSchema, getSql } from '../_lib/db';
import { signAccess, signRefresh, verifyPassword } from '../_lib/auth';
import { handler, json, readJson, httpError } from '../_lib/http';

interface Body {
  login: string;
  password: string;
}

export default handler(async (req) => {
  if (req.method !== 'POST') throw httpError(405, 'طريقة غير مدعومة.');
  await ensureSchema();
  const { login, password } = await readJson<Body>(req);
  const q = getSql();
  const rows = await q`SELECT id, family_id, pass_hash, name, role, person_id FROM users WHERE login = ${login}`;
  const u = rows[0] as { id: string; family_id: string; pass_hash: string; name: string; role: string; person_id: string | null } | undefined;
  if (!u || !verifyPassword(password, u.pass_hash)) {
    throw httpError(401, 'اسم الدخول أو كلمة المرور غير صحيحة.');
  }
  return json(req, 200, {
    user: { id: u.id, familyId: u.family_id, login, name: u.name, role: u.role, personId: u.person_id ?? undefined },
    tokens: {
      accessToken: await signAccess(u.id, u.family_id, u.role),
      refreshToken: await signRefresh(u.id, u.family_id),
    },
  });
});
