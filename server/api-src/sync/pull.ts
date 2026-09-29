// GET /api/sync/pull?since=N — يسحب تغييرات العائلة بعد المؤشر N (نمط req/res).

import { ensureSchema, getSql } from '../_lib/db';
import { requireAuth } from '../_lib/auth';
import { handler, json, httpError, fullUrl, type VReq, type VRes } from '../_lib/http';

const ENTITIES = ['meds', 'schedules', 'lab_results', 'symptoms', 'food_logs', 'persons', 'dose_events', 'inventory_events'];
const CLIENT_NAMES: Record<string, string> = {
  meds: 'meds',
  schedules: 'schedules',
  lab_results: 'labResults',
  symptoms: 'symptoms',
  food_logs: 'foodLogs',
  persons: 'persons',
  dose_events: 'doseEvents',
  inventory_events: 'inventoryEvents',
};

export default handler(async (req: VReq, res: VRes) => {
  if (req.method !== 'GET') throw httpError(405, 'طريقة غير مدعومة.');
  await ensureSchema();
  const ctx = await requireAuth(req);
  const url = fullUrl(req);
  const since = Number(url.searchParams.get('since') ?? 0);
  if (!Number.isFinite(since) || since < 0) throw httpError(400, 'مؤشر since غير صالح.');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 500), 1000);

  const q = getSql();
  const changes: { entity: string; row: Record<string, unknown> }[] = [];
  let maxSeq = since;
  let hasMore = false;

  for (const table of ENTITIES) {
    if (hasMore) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await q(
      `SELECT id, server_seq, data, updated_at, deleted_at FROM ${table}
       WHERE family_id = $1 AND server_seq > $2
       ORDER BY server_seq ASC LIMIT $3`,
      [ctx.familyId, since, limit + 1],
    ) as any[];
    const slice = rows.slice(0, limit);
    for (const r of slice) {
      const data = r.data as Record<string, unknown>;
      data.id = String(r.id);
      data.serverSeq = Number(r.server_seq);
      if ('updated_at' in r && !('updatedAt' in data) && table !== 'dose_events' && table !== 'inventory_events') {
        data.updatedAt = Number(r.updated_at);
      }
      if ('deleted_at' in r && table !== 'dose_events' && table !== 'inventory_events') {
        data.deletedAt = r.deleted_at ? Number(r.deleted_at) : null;
      }
      changes.push({ entity: CLIENT_NAMES[table], row: data });
    }
    if (slice.length) maxSeq = Math.max(maxSeq, Number(slice[slice.length - 1].server_seq));
    if (rows.length > limit) hasMore = true;
  }

  const last = await q`SELECT last_seq FROM families WHERE id = ${ctx.familyId}`;
  json(req, res, 200, {
    changes,
    lastSeq: hasMore ? maxSeq : Math.max(maxSeq, Number(last[0]?.last_seq ?? 0)),
    hasMore,
  });
});
