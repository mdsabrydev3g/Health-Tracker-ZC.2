// api/_handlers/ai — منطق مزودي AI في ملف واحد (يستدعيه ai/[action].ts).

import { ensureSchema, getSql, nextFamilySeq } from '../_lib/db';
import { requireAuth } from '../_lib/auth';
import { json, readJson, httpError } from '../_lib/http';
import { completeWithFallback, providersStatus } from '../_lib/aiProviders';
import type { AiMessage } from '../_lib/aiTypes';

const DAILY_LIMIT = 60; // طلب/يوم/عائلة — يحمي الحصص المجانية

const SAFETY_AR = [
  'أنت مساعد صحي للقراءة والتنظيم فقط، وليس طبيباً.',
  'ممنوع منعاً باتاً اقتراح تغيير جرعة، أو إيقاف دواء، أو بدء دواء، أو تشخيص حالة.',
  'اشرح المصطلحات والقيم ببساطة، وقارن القيم بنطاقها الطبيعي إن ورد في التقرير فقط.',
  'إن كانت المعلومات ناقصة قل ذلك بوضوح، ولا تخترع أي قيم أو أسماء أدوية.',
  'اختم كل رد بسطر: «هذا مساعد تنظيمي وليس تشخيصاً طبياً — راجع طبيبك.»',
].join('\n');

interface Body {
  capability: 'summarize_lab' | 'summarize_imaging' | 'medbox_vision' | 'chat';
  messages: AiMessage[];
  fileDataUrl?: string;
  maxTokens?: number;
}

const MAX_FILE_BYTES = 6 * 1024 * 1024;

/** GET /api/ai/status — المزودون المتاحون (بلا مفاتيح) */
export async function handleStatus(req: Request): Promise<Response> {
  const providers = providersStatus();
  return json(req, 200, { providers, any: providers.some((p) => p.available) });
}

/** POST /api/ai/run | /api/ai/summarize | /api/ai/chat */
export async function handleRun(req: Request): Promise<Response> {
  if (req.method !== 'POST') throw httpError(405, 'طريقة غير مدعومة.');
  await ensureSchema();
  const ctx = await requireAuth(req);
  const body = await readJson<Body>(req);

  if (body.fileDataUrl && body.fileDataUrl.length > MAX_FILE_BYTES) {
    throw httpError(413, 'الملف كبير جداً — الحد 6 ميجابايت.');
  }

  const q = getSql();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await q`SELECT ai_day, ai_calls_today FROM families WHERE id = ${ctx.familyId}`;
  const f = rows[0] as { ai_day: string | null; ai_calls_today: number } | undefined;
  if (f && f.ai_day === today && f.ai_calls_today >= DAILY_LIMIT) {
    throw httpError(429, `بلغت حد اليوم (${DAILY_LIMIT} طلباً) — حماية للحصة المجانية. جرّب غداً.`);
  }

  // نفرض مطالبة النظام الآمنة أولاً في كل طلب
  const messages: AiMessage[] = [{ role: 'system', content: SAFETY_AR }, ...(body.messages ?? [])];
  const result = await completeWithFallback({
    capability: body.capability ?? 'chat',
    messages,
    fileDataUrl: body.fileDataUrl,
    maxTokens: body.maxTokens,
  });

  if (f && f.ai_day === today) {
    await q`UPDATE families SET ai_calls_today = ai_calls_today + 1 WHERE id = ${ctx.familyId}`;
  } else {
    await q`UPDATE families SET ai_day = ${today}, ai_calls_today = 1 WHERE id = ${ctx.familyId}`;
    await nextFamilySeq(ctx.familyId);
  }

  return json(req, 200, { text: result.text, provider: result.provider, model: result.model });
}
