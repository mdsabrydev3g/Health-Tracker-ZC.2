import { describe, it, expect } from 'vitest';
import { parseGs1, parseBarcode, decodeGs1Date, normalizeGtin, parseEan } from '@/core/barcode/gs1';

const GS = String.fromCharCode(29);

describe('decodeGs1Date', () => {
  it('YYMMDD كامل', () => {
    expect(decodeGs1Date('270930')).toBe('2027-09-30');
  });
  it('يوم 00 = نهاية الشهر', () => {
    expect(decodeGs1Date('270200')).toBe('2027-02-28');
  });
  it('تاريخ غير صالح', () => {
    expect(decodeGs1Date('271300')).toBe('');
  });
});

describe('parseGs1', () => {
  it('DataMatrix: (01) GTIN + (17) انتهاء + (10) تشغيلة', () => {
    const raw = `01062810090019281727093010ABC123`;
    const r = parseGs1(raw);
    expect(r.isGs1).toBe(true);
    expect(r.gtin).toBe('06281009001928');
    expect(r.expiry).toBe('2027-09-30');
    expect(r.batch).toBe('ABC123');
  });

  it('مع فواصل FNC1 بين العناصر', () => {
    const raw = `0106281009001928${GS}17270930${GS}10BATCH9`;
    const r = parseGs1(raw);
    expect(r.gtin).toBe('06281009001928');
    expect(r.batch).toBe('BATCH9');
  });

  it('بأقواس قابلة للقراءة البشرية', () => {
    const r = parseGs1('(01)06281009001928(17)271231(10)X1');
    expect(r.expiry).toBe('2027-12-31');
    expect(r.batch).toBe('X1');
  });

  it('بادئة معرف المرمز ]d2 تُزال', () => {
    const r = parseGs1(`]d201062810090019281727093010AB`);
    expect(r.gtin).toBe('06281009001928');
  });

  it('رمز عشوائي غير GS1 يبقى بلا استنتاجات', () => {
    const r = parseGs1('hello-world-123');
    expect(r.isGs1).toBe(false);
    expect(r.gtin).toBeUndefined();
  });
});

describe('parseBarcode — نقطة الدخول', () => {
  it('EAN-13 بسيط', () => {
    const r = parseBarcode('6291041500213');
    expect(r.ean).toBe('6291041500213');
    expect(r.isGs1).toBe(false);
  });
  it('GTIN-14 يُطبّع بأصفار', () => {
    expect(normalizeGtin('6281009001928')).toBe('06281009001928');
  });
  it('EAN-8', () => {
    expect(parseEan('96385074')?.ean).toBe('96385074');
    expect(parseEan('12345')).toBeNull();
  });
});
