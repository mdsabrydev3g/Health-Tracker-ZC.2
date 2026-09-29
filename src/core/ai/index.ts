// ============================================================
// core/ai — تجريد مزودي الذكاء الاصطناعي. نقية: تعريفات، بُني مطالبات،
// تنقية نص، وحدود أمان صارمة. المفاتيح تعيش على السيرفر فقط.
// ============================================================

export type AiCapability = 'summarize_lab' | 'summarize_imaging' | 'medbox_vision' | 'chat';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiRequest {
  capability: AiCapability;
  messages: AiMessage[];
  /** ملف مرفق (صورة أشعة/تحليل أو علبة دواء) بصيغة dataURL */
  fileDataUrl?: string;
  fileMime?: string;
  maxTokens?: number;
}

export interface AiResponse {
  text: string;
  provider: string;
  model?: string;
}

export type AiProviderId = 'gemini' | 'groq' | 'openrouter' | 'pollinations';

export interface AiProvider {
  id: AiProviderId;
  /** هل المزود متاح الآن (مفتاح مضبوط على السيرفر مثلاً)؟ */
  available: () => Promise<boolean>;
  complete: (req: AiRequest) => Promise<AiResponse>;
}

/** تعليمات النظام — حدود أمان صارمة في كل طلب */
export function safetySystemPrompt(lang: 'ar' | 'en'): AiMessage {
  if (lang === 'ar') {
    return {
      role: 'system',
      content: [
        'أنت مساعد صحي للقراءة والتنظيم فقط، وليس طبيباً.',
        'قواعد إلزامية:',
        '1) ممنوع منعاً باتاً اقتراح تغيير جرعة، أو إيقاف دواء، أو بدء دواء، أو تشخيص حالة.',
        '2) اشرح المصطلحات والقيم ببساطة، وقارن القيم بنطاقها الطبيعي إن ورد في التقرير.',
        '3) إن لم تكن متأكداً أو كانت المعلومات ناقصة، قل ذلك بوضوح.',
        '4) اختم كل رد بسطر: «هذا مساعد تنظيمي وليس تشخيصاً طبياً — راجع طبيبك.»',
        '5) لا تخترع أسماء أدوية أو قيم مختبرية غير موجودة في النص أو الصورة.',
      ].join('\n'),
    };
  }
  return {
    role: 'system',
    content: [
      'You are a health-document organizing assistant, not a doctor.',
      'Mandatory rules:',
      '1) NEVER suggest changing a dose, stopping a medication, starting one, or diagnosing.',
      '2) Explain terms and values simply; compare lab values to their stated reference ranges only.',
      '3) Say clearly when information is missing or uncertain.',
      '4) End every reply with: "This is an organizing assistant, not a medical diagnosis — consult your doctor."',
      '5) Never invent drug names or lab values not present in the text/image.',
    ].join('\n'),
  };
}

export function labSummaryUserPrompt(title: string, kind: 'lab' | 'imaging', ocrText?: string): AiMessage {
  const what = kind === 'lab' ? 'تقرير تحاليل مخبرية' : 'تقرير أشعة/تصوير طبي';
  return {
    role: 'user',
    content: [
      `المرفق ${what} بعنوان «${title}».`,
      ocrText ? `نص مستخرج من الملف:\n${ocrText}` : 'اقرأ الملف المرفق مباشرة.',
      'المطلوب:',
      '1) استخراج القيم في جدول: اسم التحليل، القيمة، الوحدة، النطاق الطبيعي، وهل هي خارج النطاق (علّمها ⚠).',
      '2) ملخص من 3 أسطر بلغة بسيطة لغير الطبيب.',
      '3) 3 أسئلة مقترحة لسؤال الطبيب في الزيارة القادمة.',
      'لا تُضف أي قيمة غير موجودة في الملف.',
    ].join('\n'),
  };
}

export function medboxVisionUserPrompt(): AiMessage {
  return {
    role: 'user',
    content: [
      'الصورة لعلبة دواء. استخرج فقط ما هو مكتوب عليها:',
      '- الاسم التجاري (عربي وإنجليزي إن وجد)',
      '- المادة الفعالة والتركيز',
      '- الشكل الصيدلاني (قرص/شراب/قطرة/حقن...)',
      '- رقم GTIN/الباركود إن ظهر',
      '- تاريخ الانتهاء والتشغيلة إن ظهرا',
      'أعدها بصيغة JSON فقط: {"nameAr":"","nameEn":"","activeIngredient":"","strength":"","form":"","gtin":"","expiry":"YYYY-MM-DD","batch":""}',
      'اترك الحقل فارغاً "" إن لم يظهر بوضوح. لا تخترع أي بيانات.',
    ].join('\n'),
  };
}

export function chatSystemAddon(): AiMessage {
  return {
    role: 'system',
    content: [
      'في وضع المحادثة: اشرح المصطلحات الطبية بلغة بسيطة، اقترح أسئلة للطبيب،',
      'وننبّه إن ذكر المستخدم أدويتين تحويان المادة الفعالة نفسها (مكررة محتملة) —',
      'بلا أي توصية بتغيير علاج، وأحله لطبيبه.',
    ].join('\n'),
  };
}

/** موافقة صريحة: نص يعرض للمستخدم قبل إرسال أي ملف لمزود خارجي */
export function consentTextAr(provider: string, hasFile: boolean): string {
  return [
    `سيتم إرسال ${hasFile ? 'الملف/الصورة ' : ''}والنص المتعلق به إلى خدمة ذكاء اصطناعي خارجية (${provider}) لتحليله.`,
    'هذه البيانات صحية وحساسة. لن يتم الإرسال دون موافقتك،',
    'ويمكنك تعطيل ميزة الذكاء الاصطناعي كلياً من الإعدادات.',
  ].join(' ');
}

/** تنقية النص قبل الإرسال: يزيل ما يبدو معرفاً وطنياً/هاتفياً/بريداً */
export function redactText(text: string): string {
  return text
    .replace(/\b\d{14}\b/g, '[رقم وطني محذوف]')
    .replace(/\b01\d{9}\b/g, '[هاتف محذوف]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[بريد محذوف]');
}

/** سقف حجم النص المرسل (حماية حصة المزود المجاني) */
export function clampText(text: string, maxChars = 12_000): string {
  return text.length > maxChars ? text.slice(0, maxChars) + '…[اقتُطع]' : text;
}

/** كشف تفاعل بسيط: مادة فعالة مكررة بين أدوية المستخدم (بلا توصيات) */
export function duplicateIngredientWarning(
  meds: { nameAr: string; activeIngredient?: string }[],
): string[] {
  const byIng = new Map<string, string[]>();
  for (const m of meds) {
    const ing = (m.activeIngredient ?? '').trim().toLowerCase();
    if (!ing || ing.length < 3) continue;
    byIng.set(ing, [...(byIng.get(ing) ?? []), m.nameAr]);
  }
  const warnings: string[] = [];
  for (const [ing, names] of byIng) {
    if (names.length > 1) {
      warnings.push(`المادة الفعالة «${ing}» مكررة في: ${names.join('، ')}`);
    }
  }
  return warnings;
}

/** طابور بسيط: يمنع تزامن الطلبات ويعيد المحاولة مع تراجع */
export class AiQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private callsThisMinute = 0;
  private windowStart = 0;
  constructor(private maxPerMinute = 8) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(task);
    this.chain = result.catch(() => undefined);
    return result;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.callsThisMinute = 0;
    }
    if (this.callsThisMinute >= this.maxPerMinute) {
      const wait = 60_000 - (now - this.windowStart) + 50;
      await new Promise((r) => setTimeout(r, wait));
      return this.acquire();
    }
    this.callsThisMinute++;
  }

  /** رسالة انتهاء الحصة المجانية */
  static quotaError(provider: string): Error {
    return new Error(`انتهت الحصة المجانية مؤقتاً لدى ${provider} — جرّب بعد قليل أو بدّل المزود من الإعدادات.`);
  }
}
