// نسخة ميني من تحويل اليوم/الوقت داخل منطقة زمنية — للسيرفر فقط
// (نفس منطق core/time لتجنب استيراد مسارات src من api).

export function zonedTimeToEpoch(dayKey: string, hhmm: string, tz: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  let offset = tzOffsetMs(tz, guess);
  let result = guess - offset;
  offset = tzOffsetMs(tz, result);
  result = guess - offset;
  return result;
}

function tzOffsetMs(tz: string, at: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUTC - at;
}
