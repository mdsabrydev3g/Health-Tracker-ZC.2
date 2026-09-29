// GET /api/backup/list — قائمة النسخ الاحتياطية (بلا محتوى)

import { ensureSchema, getSql } from '../_lib/db';
import { requireAuth } from '../_lib/auth';
import { handler, json } from '../_lib/http';

export default handler(async (req) => {
  await ensureSchema();
  const ctx = await requireAuth(req);
  const q = getSql();
  const rows = await q`SELECT id, size, created_at FROM backups
                       WHERE family_id = ${ctx.familyId} ORDER BY created_at DESC LIMIT 10`;
  return json(req, 200, {
    backups: (rows as { id: string; size: number; created_at: string }[]).map((r) => ({
      id: r.id, size: Number(r.size), createdAt: Number(r.created_at),
    })),
  });
});
