// api/_lib/aiProviders — سلسلة مزودين: Gemini → Groq → OpenRouter →
// Pollinations. المفاتيح من متغيرات البيئة فقط ولا تُعاد للعميل أبداً.

import type { AiRequest } from './aiTypes';

export interface ProviderInfo {
  id: string;
  available: boolean;
}

export function providersStatus(): ProviderInfo[] {
  return [
    { id: 'gemini', available: Boolean(process.env.GEMINI_API_KEY) },
    { id: 'groq', available: Boolean(process.env.GROQ_API_KEY) },
    { id: 'openrouter', available: Boolean(process.env.OPENROUTER_API_KEY) },
    { id: 'pollinations', available: true }, // بلا مفتاح — الخيار الأخير
  ];
}

interface ChatPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

function splitDataUrl(dataUrl?: string): { mime: string; b64: string } | null {
  if (!dataUrl) return null;
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], b64: m[2] };
}

async function callGemini(req: AiRequest): Promise<{ text: string; model: string }> {
  const model = req.fileDataUrl ? 'gemini-1.5-flash' : 'gemini-1.5-flash';
  const parts: ChatPart[] = req.messages.map((m) => ({ text: m.content }));
  const file = splitDataUrl(req.fileDataUrl);
  if (file) parts.push({ inline_data: { mime_type: file.mime, data: file.b64 } });
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: req.messages.find((m) => m.role === 'system')?.content ?? '' }] },
        contents: [{ role: 'user', parts: parts.filter((p) => !req.messages.some((m) => m.role === 'system' && m.content === p.text)) }],
        generationConfig: { maxOutputTokens: req.maxTokens ?? 2048 },
      }),
    },
  );
  if (res.status === 429) throw Object.assign(new Error('حصة Gemini اللحظية ممتلئة (429)'), { status: 429 });
  if (!res.ok) throw new Error(`Gemini: ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return { text, model };
}

type OpenAiMsg = { role: string; content: string | { type: string; text?: string; image_url?: { url: string } }[] };

function toOpenAiMessages(req: AiRequest): OpenAiMsg[] {
  return req.messages.map((m, i) => {
    if (i === req.messages.length - 1 && req.fileDataUrl && m.role === 'user') {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          { type: 'image_url', image_url: { url: req.fileDataUrl } },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

async function callOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  req: AiRequest,
  extraHeaders: Record<string, string> = {},
): Promise<{ text: string; model: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extraHeaders },
    body: JSON.stringify({
      model,
      messages: toOpenAiMessages(req),
      max_tokens: req.maxTokens ?? 2048,
    }),
  });
  if (res.status === 429) throw Object.assign(new Error(`حصة ${model} اللحظية ممتلئة (429)`), { status: 429 });
  if (!res.ok) throw new Error(`${model}: ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { text: data.choices?.[0]?.message?.content ?? '', model };
}

async function callPollinations(req: AiRequest): Promise<{ text: string; model: string }> {
  // POST (لا نضع نصاً طبياً في URL أبداً)
  const res = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: req.messages,
      max_tokens: req.maxTokens ?? 2048,
    }),
  });
  if (res.status === 429) throw Object.assign(new Error('حصة Pollinations اللحظية ممتلئة (429)'), { status: 429 });
  if (!res.ok) throw new Error(`Pollinations: ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { text: data.choices?.[0]?.message?.content ?? '', model: 'pollinations/openai' };
}

/** ينفذ عبر أول مزود متاح ثم يتراجع للبقية عند الفشل */
export async function completeWithFallback(req: AiRequest): Promise<{ text: string; provider: string; model: string }> {
  const chain = providersStatus().filter((p) => p.available);
  const errors: string[] = [];
  for (const p of chain) {
    try {
      if (p.id === 'gemini') {
        const r = await callGemini(req);
        return { text: r.text, provider: 'gemini', model: r.model };
      }
      if (p.id === 'groq') {
        const r = await callOpenAiCompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          process.env.GROQ_API_KEY!,
          req.fileDataUrl ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile',
          req,
        );
        return { text: r.text, provider: 'groq', model: r.model };
      }
      if (p.id === 'openrouter') {
        const r = await callOpenAiCompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          process.env.OPENROUTER_API_KEY!,
          req.fileDataUrl ? 'google/gemini-flash-1.5:free' : 'meta-llama/llama-3.3-70b-instruct:free',
          req,
          { 'HTTP-Referer': 'health-tracker', 'X-Title': 'Health Tracker' },
        );
        return { text: r.text, provider: 'openrouter', model: r.model };
      }
      if (p.id === 'pollinations') {
        const r = await callPollinations(req);
        return { text: r.text, provider: 'pollinations', model: r.model };
      }
    } catch (e) {
      errors.push(`${p.id}: ${(e as Error).message}`);
    }
  }
  throw new Error(
    errors.length
      ? `تعذر إكمال الطلب لدى جميع المزودين (${errors.join(' | ')})`
      : 'لا يوجد مزود AI مضبوط على السيرفر.',
  );
}
