// ai/client — عميل الذكاء الاصطناعي: سلسلة مزودين قابلة للتبديل عبر السيرفر
// (المفاتيح على السيرفر فقط)، موافقة صريحة قبل كل إرسال، طابور وحدود معدل.

import type { AiRequest, AiResponse } from '@/core/ai';
import { AiQueue, consentTextAr } from '@/core/ai';
import { apiFetch, useSession } from '@/data/stores/session';
import { useSettings } from '@/data/stores/settings';
import { useUi } from '@/data/stores/ui';

const queue = new AiQueue(8);

export interface AiAvailability {
  providers: { id: string; available: boolean }[];
  any: boolean;
}

export async function aiAvailability(): Promise<AiAvailability> {
  try {
    return await apiFetch<AiAvailability>(useSession.getState, '/ai/status');
  } catch {
    return { providers: [], any: false };
  }
}

async function postAi(endpoint: string, body: Record<string, unknown>): Promise<AiResponse> {
  return apiFetch<AiResponse>(useSession.getState, endpoint, { method: 'POST', body });
}

/** يطلب موافقة المستخدم (مرة لكل إرسال) ثم ينفذ الطلب عبر الطابور */
export async function aiRun(
  endpoint: '/ai/summarize' | '/ai/chat',
  req: AiRequest,
): Promise<AiResponse> {
  const { aiEnabled } = useSettings.getState();
  if (!aiEnabled) throw new Error('ميزة الذكاء الاصطناعي معطَّلة من الإعدادات.');

  const provider = await preferredProvider();
  const ok = await useUi.getState().askConfirm(
    'موافقة على الإرسال',
    consentTextAr(provider, Boolean(req.fileDataUrl)),
    { confirmLabel: 'أوافق وأرسل', danger: false },
  );
  if (!ok) throw new Error('أُلغي الإرسال — لم توافق على مشاركة البيانات.');

  return queue.run(async () => {
    await queue.acquire();
    try {
      return await postAi(endpoint, {
        capability: req.capability,
        messages: req.messages,
        fileDataUrl: req.fileDataUrl,
        fileMime: req.fileMime,
        maxTokens: req.maxTokens,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/429|quota|rate/i.test(msg)) throw AiQueue.quotaError(provider);
      throw e;
    }
  });
}

async function preferredProvider(): Promise<string> {
  const av = await aiAvailability();
  return av.providers.find((p) => p.available)?.id ?? 'pollinations';
}

/** OCR محلي احتياطي عبر Tesseract (يُحمَّل عند الحاجة فقط) */
export async function ocrImage(dataUrl: string, lang = 'ara+eng'): Promise<string> {
  try {
    const mod = await import('tesseract.js');
    const res = await mod.recognize(dataUrl, lang);
    return res.data.text ?? '';
  } catch {
    return '';
  }
}
