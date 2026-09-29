// core/time — أدوات زمنية نقية تعتمد المنطقة الزمنية للعائلة.

export function localDayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function localTimeHM(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function tzOffsetMs(tz: string, at: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUTC - at;
}

/** يحوّل (مفتاح يوم + HH:mm محلي) إلى epoch ms داخل المنطقة الزمنية */
export function zonedTimeToEpoch(dayKey: string, hhmm: string, tz: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  let offset = tzOffsetMs(tz, guess);
  let result = guess - offset;
  // تصحيح ثانٍ للحدود الاستثنائية (DST)
  offset = tzOffsetMs(tz, result);
  result = guess - offset;
  return result;
}

/** يوم الأسبوع المحلي 0=الأحد..6=السبت لمفتاح يوم */
export function weekdayOfDayKey(dayKey: string, tz: string): number {
  const epoch = zonedTimeToEpoch(dayKey, '12:00', tz);
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(new Date(epoch));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(s);
}

export function addDaysToDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function diffDayKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000,
  );
}

/** يبدّل مفتاح اليوم إلى تاريخ مقروء عربي مختصر */
export function formatDayKeyAr(dayKey: string): string {
  const [y, m, d] = dayKey.split('-');
  return `${d}/${m}/${y}`;
}

/** يبدّل HH:mm إلى صيغة عربية 12 ساعة */
export function formatTimeAr(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map(Number);
  const period = hh < 12 ? 'ص' : 'م';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}
