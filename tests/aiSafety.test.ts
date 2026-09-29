import { describe, it, expect } from 'vitest';
import {
  safetySystemPrompt, redactText, clampText, duplicateIngredientWarning, AiQueue, consentTextAr,
} from '@/core/ai';

describe('حماية AI', () => {
  it('مطالبة النظام تمنع التشخيص وتمنع تغيير الجرعات', () => {
    const s = safetySystemPrompt('ar').content;
    expect(s).toContain('ممنوع');
    expect(s).toContain('راجع طبيبك');
  });

  it('النص يُنقّى من المعرفات والهواتف والبريد', () => {
    const out = redactText('الاسم رقمه 29801011234567 هاتف 01012345678 بريد a.b@x.com');
    expect(out).not.toContain('29801011234567');
    expect(out).not.toContain('01012345678');
    expect(out).not.toContain('a.b@x.com');
  });

  it('clampText يقصّ النص الطويل', () => {
    expect(clampText('x'.repeat(15_000)).length).toBeLessThanOrEqual(12_010);
  });
});

describe('duplicateIngredientWarning — مادة فعالة مكررة', () => {
  it('ينبّه عند التكرار بلا توصيات', () => {
    const w = duplicateIngredientWarning([
      { nameAr: 'بنادول', activeIngredient: 'Paracetamol' },
      { nameAr: 'سيتال', activeIngredient: 'paracetamol' },
      { nameAr: 'أوميز', activeIngredient: 'Omeprazole' },
    ]);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('paracetamol');
  });
  it('بلا تكرار: لا تحذير', () => {
    expect(duplicateIngredientWarning([
      { nameAr: 'أ', activeIngredient: 'X1' },
      { nameAr: 'ب', activeIngredient: 'X2' },
    ])).toHaveLength(0);
  });
});

describe('AiQueue — الطابور وحدود المعدل', () => {
  it('ينفذ بالتسلسل ويلتقط الأخطاء دون كسر السلسلة', async () => {
    const q = new AiQueue(100);
    const order: number[] = [];
    await Promise.all([
      q.run(async () => { await new Promise((r) => setTimeout(r, 20)); order.push(1); }),
      q.run(async () => { order.push(2); }),
      q.run(async () => { throw new Error('فشل'); }).catch(() => undefined),
      q.run(async () => { order.push(3); }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});

describe('الموافقة', () => {
  it('نص الموافقة يذكر المزود وضرر البيانات الصحية', () => {
    const t = consentTextAr('Gemini', true);
    expect(t).toContain('Gemini');
    expect(t).toContain('موافقتك');
  });
});
