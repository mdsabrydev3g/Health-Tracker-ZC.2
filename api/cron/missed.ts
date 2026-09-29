// GET /api/cron/missed — (Vercel Cron كل 15 دقيقة) يفحص الجرعات الفائتة
// لكل عائلة ويرسل Push للأجهزة الأخرى. يكمل فحص الجهاز المحلي.

import { ensureSchema, getSql } from '../_lib/db';
import { handler, json } from '../_lib/http';
import { fcmConfigured, sendPush } from '../_lib/fcm';
import { zonedTimeToEpoch } from './_time';

export default handler(async (req) => {
  if (req.method !== 'GET') return json(req, 405, { error: 'طريقة غير مدعومة.' });
  await ensureSchema();
  if (!fcmConfigured()) return json(req, 200, { ok: true, skipped: 'FCM غير مضبوط' });

  const q = getSql();
  const families = await q`SELECT id, tz FROM families` as { id: string; tz: string }[];
  const now = Date.now();
  let notified = 0;

  for (const fam of families) {
    const scheds = await q`SELECT data FROM schedules WHERE family_id = ${fam.id} AND deleted_at IS NULL` as { data: { id: string; times: string[]; active: boolean; startDate: number; endDate?: number; daysOfWeek?: number[]; medId: string } }[];
    const meds = await q`SELECT id, data FROM meds WHERE family_id = ${fam.id} AND deleted_at IS NULL` as { id: string; data: { nameAr: string; personId: string } }[];
    const events = await q`SELECT data FROM dose_events WHERE family_id = ${fam.id} AND data->>'plannedFor' IS NOT NULL
                           AND (data->>'plannedFor')::bigint > ${now - 26 * 3600_000}` as { data: { scheduleId?: string; plannedFor: number; status: string } }[];

    const medName = new Map(meds.map((m) => [m.id, m.data.nameAr]));
    const doneKeys = new Set(events.map((e) => `${e.data.scheduleId ?? ''}|${e.data.plannedFor}`));

    // فحص يومين (اليوم والأمس) بتوقيت العائلة
    const dayKeys = [0, 1].map((i) => new Date(now - i * 86_400_000).toISOString().slice(0, 10));
    const missed: { scheduleId: string; plannedFor: number; medName: string; time: string }[] = [];
    for (const s of scheds) {
      if (!s.data?.active) continue;
      for (const dayKey of dayKeys) {
        const wd = new Date(zonedTimeToEpoch(dayKey, '12:00', fam.tz)).getUTCDay();
        if (s.data.daysOfWeek && !s.data.daysOfWeek.includes(wd)) continue;
        for (const time of s.data.times ?? []) {
          const pf = zonedTimeToEpoch(dayKey, time, fam.tz);
          if (pf + 30 * 60_000 >= now) continue;
          if (doneKeys.has(`${s.data.id}|${pf}`)) continue;
          missed.push({ scheduleId: s.data.id, plannedFor: pf, medName: medName.get(s.data.medId) ?? '', time });
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
  return json(req, 200, { ok: true, notified });
});
