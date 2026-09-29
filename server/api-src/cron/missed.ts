// GET /api/cron/missed — فحص الجرعات الفائتة لكل عائلة وPush للأجهزة (نمط req/res).
// مخصص للنداء اليدوي أو cron خارجي (خطة Hobby لا تدعم crons متكررة في vercel.json).

import { ensureSchema, getSql } from '../_lib/db';
import { handler, json, type VReq, type VRes } from '../_lib/http';
import { fcmConfigured, sendPush } from '../_lib/fcm';
import { zonedTimeToEpoch } from './_time';

export default handler(async (req: VReq, res: VRes) => {
  await ensureSchema();
  if (!fcmConfigured()) {
    json(req, res, 200, { ok: true, skipped: 'FCM غير مضبوط' });
    return;
  }

  const q = getSql();
  const families = await q`SELECT id, tz FROM families` as { id: string; tz: string }[];
  const now = Date.now();
  let notified = 0;

  for (const fam of families) {
    const scheds = await q`SELECT data FROM schedules WHERE family_id = ${fam.id} AND deleted_at IS NULL` as { data: { id: string; times: string[]; active: boolean; daysOfWeek?: number[]; medId: string } }[];
    const meds = await q`SELECT id, data FROM meds WHERE family_id = ${fam.id} AND deleted_at IS NULL` as { id: string; data: { nameAr: string } }[];
    const events = await q`SELECT data FROM dose_events WHERE family_id = ${fam.id}
                           AND (data->>'plannedFor')::bigint > ${now - 26 * 3600_000}` as { data: { scheduleId?: string; plannedFor: number; status: string } }[];

    const medName = new Map(meds.map((m) => [m.id, m.data.nameAr]));
    const doneKeys = new Set(events.map((e) => `${e.data.scheduleId ?? ''}|${e.data.plannedFor}`));

    // فحص يومين (اليوم والأمس) بتوقيت العائلة
    const dayKeys = [0, 1].map((i) => new Date(now - i * 86_400_000).toISOString().slice(0, 10));
    const missed: { medName: string; time: string }[] = [];
    for (const s of scheds) {
      if (!s.data?.active) continue;
      for (const dayKey of dayKeys) {
        const wd = new Date(zonedTimeToEpoch(dayKey, '12:00', fam.tz)).getUTCDay();
        if (s.data.daysOfWeek && !s.data.daysOfWeek.includes(wd)) continue;
        for (const time of s.data.times ?? []) {
          const pf = zonedTimeToEpoch(dayKey, time, fam.tz);
          if (pf + 30 * 60_000 >= now) continue;
          if (doneKeys.has(`${s.data.id}|${pf}`)) continue;
          missed.push({ medName: medName.get(s.data.medId) ?? '', time });
        }
      }
    }

    if (!missed.length) continue;
    const devices = await q`SELECT push_token FROM devices
                            WHERE family_id = ${fam.id} AND push_token IS NOT NULL AND push_token <> ''` as { push_token: string }[];
    for (const d of devices.slice(0, 20)) {
      const ok = await sendPush({
        token: d.push_token,
        title: `فاتت ${missed.length} جرعة/جرعات`,
        body: missed.slice(0, 3).map((m) => `${m.medName} (${m.time})`).join('، ') + (missed.length > 3 ? '…' : ''),
        urgent: false,
        data: { kind: 'dose_missed', count: String(missed.length) },
      });
      if (ok) notified++;
    }
  }
  json(req, res, 200, { ok: true, notified });
});
