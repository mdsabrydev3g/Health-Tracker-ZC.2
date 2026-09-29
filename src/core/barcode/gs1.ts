// ============================================================
// core/barcode/gs1 — محلل GS1: DataMatrix/QR (بصيغة FNC1/AI)
// وEAN/UPC. يستخرج GTIN وتاريخ الانتهاء والتشغيلة. نقية بالكامل.
// لا يخترع بيانات دواء — يقرأ ما هو مكتوب فعلاً على العلبة.
// ============================================================

export interface Gs1Parsed {
  gtin?: string; // AI(01)/(02)
  expiry?: string; // AI(17) → YYYY-MM-DD
  batch?: string; // AI(10)
  serial?: string; // AI(21)
  productionDate?: string; // AI(11)
  packDate?: string; // AI(13)
  weightKg?: string; // AI(31x)
  raw: string;
  isGs1: boolean;
}

const FIXED_LEN: Record<string, number> = {
  '00': 18, '01': 14, '02': 14, '03': 14, '04': 14,
  '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6,
  '20': 2,
};

// عناصر ذات طول متغير (تنتهي بـ FNC1 في DataMatrix، أو حتى النهاية في QR)
const VARIABLE_STARTS = ['10', '21', '22', '235', '240', '241', '250', '251', '253', '254', '30', '37', '3900', '3901', '3902', '3903', '3910', '3920', '3930', '400', '401', '402', '403', '410', '411', '412', '413', '414', '415', '416', '417', '420', '421', '422', '423', '424', '425', '426', '427', '710', '711', '712', '713', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99'];

const GS = String.fromCharCode(29); // فاصل FNC1 بعد فك الترميز

function matchVariableAI(s: string, pos: number): string | null {
  // جرّب الأطول أولاً
  for (const start of VARIABLE_STARTS) {
    if (s.startsWith(start, pos)) return start;
  }
  return null;
}

/** يفك نصاً مقروءاً من DataMatrix/QR يحمل عناصر GS1 */
export function parseGs1(raw: string): Gs1Parsed {
  const result: Gs1Parsed = { raw, isGs1: false };
  let s = raw;
  // أنماط شائعة: (01)xxx(17)xxx أو ]d2 / ]C1 بادئات المعرف
  s = s.replace(/^\]d2/, '').replace(/^\]C1/, '').replace(/^\]e0/, '').replace(/^\]Q3/, '');
  // أقواس اختيارية "(01)..." → نص عادي
  if (/\(\d{2,4}\)/.test(s)) {
    s = s.replace(/\((\d{2,4})\)/g, '$1');
  }
  let pos = 0;
  while (pos < s.length) {
    if (s[pos] === GS) { pos++; continue; }
    let ai: string | null = null;
    // AI ثابت الطول (أول رقمين)
    const two = s.slice(pos, pos + 2);
    if (FIXED_LEN[two]) ai = two;
    if (!ai) {
      const v = matchVariableAI(s, pos);
      if (v) ai = v;
    }
    if (!ai) break; // ليس GS1 صالحاً
    pos += ai.length;
    let value: string;
    if (FIXED_LEN[ai]) {
      value = s.slice(pos, pos + FIXED_LEN[ai]);
      pos += FIXED_LEN[ai];
    } else {
      const end = s.indexOf(GS, pos);
      value = end === -1 ? s.slice(pos) : s.slice(pos, end);
      pos = end === -1 ? s.length : end + 1;
    }
    result.isGs1 = true;
    switch (ai) {
      case '01': result.gtin = value; break;
      case '02': result.gtin = value; break;
      case '17': result.expiry = decodeGs1Date(value); break;
      case '11': result.productionDate = decodeGs1Date(value); break;
      case '13': result.packDate = decodeGs1Date(value); break;
      case '10': result.batch = value; break;
      case '21': result.serial = value; break;
      default: break; // عناصر أخرى نتجاهلها بأمان
    }
  }
  return result;
}

/** يحل تاريخ GS1 YYMMDD إلى YYYY-MM-DD؛ يوم 00 يعني نهاية الشهر */
export function decodeGs1Date(v: string): string {
  if (v.length !== 6) return '';
  const yy = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  const dd = Number(v.slice(4, 6));
  if (mm < 1 || mm > 12) return '';
  const century = yy + 2000 <= new Date().getFullYear() + 10 ? 2000 : 1900;
  const year = century + yy;
  if (dd === 0) {
    const lastDay = new Date(Date.UTC(year, mm, 0)).getUTCDate();
    return `${year}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** هل النص باركود منتج بسيط EAN-13/EAN-8/UPC؟ (بلا عناصر GS1) */
export function parseEan(raw: string): { ean: string; isGs1: boolean } | null {
  const t = raw.trim();
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(t)) return null;
  if (t.includes(GS)) return null;
  return { ean: t.length === 14 ? t.slice(1) : t, isGs1: false };
}

/** نقطة الدخول الموحدة: يحاول GS1 ثم EAN */
export function parseBarcode(raw: string): Gs1Parsed & { ean?: string } {
  const gs1 = parseGs1(raw);
  if (gs1.isGs1) return gs1;
  const ean = parseEan(raw);
  if (ean) return { ...gs1, ean: ean.ean };
  return gs1;
}

/** توحيد GTIN-14 (يحشى بأصفار يساراً) لتخزين متسق */
export function normalizeGtin(gtin: string): string {
  return gtin.replace(/\D/g, '').padStart(14, '0');
}
