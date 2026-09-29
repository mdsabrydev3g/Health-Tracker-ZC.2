// features/labs/ChatPanel — شات المساعدة: شرح مصطلحات، أسئلة للطبيب،
// تنبيه تفاعلات/تكرار. مع تنبيه عدم التشخيص دائماً.

import { useState } from 'react';
import { safetySystemPrompt, chatSystemAddon, clampText, redactText } from '@/core/ai';
import { aiRun } from '@/data/ai/client';
import { Button, Modal, inputCls } from '@/ui/components';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const WELCOME: Msg = {
  role: 'assistant',
  content: [
    'مرحباً! أستطيع:',
    '• شرح المصطلحات الطبية في تقاريرك',
    '• اقتراح أسئلة تسألها لطبيبك',
    '• التنبيه إن ذكرت أدويتين بنفس المادة الفعالة',
    '',
    '⚠ مساعد تنظيمي وليس تشخيصاً طبياً — لا أقترح تغيير جرعات أو إيقاف أدوية.',
  ].join('\n'),
};

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const res = await aiRun('/ai/chat', {
        capability: 'chat',
        messages: [
          safetySystemPrompt('ar'),
          chatSystemAddon(),
          ...msgs.map((m) => ({ role: m.role, content: redactText(clampText(m.content)) })),
          { role: 'user', content: redactText(clampText(text)) },
        ],
      });
      setMsgs((m) => [...m, { role: 'assistant', content: res.text }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `تعذر الإرسال: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="مساعد الصحة (غير طبي)" onClose={onClose}>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-6 max-w-[85%] ${
              m.role === 'user' ? 'bg-brand-700 text-white mr-auto' : 'bg-gray-100 text-gray-800 ml-auto'
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="text-xs text-gray-400 text-center">…يكتب</div>}
      </div>
      <div className="flex gap-2 mt-3">
        <input
          className={inputCls}
          placeholder="اكتب سؤالك… مثال: ما معنى HbA1c؟"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
        />
        <Button onClick={() => void send()} disabled={busy}>إرسال</Button>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        لا ترسل أرقام هوية أو بيانات تعريفية. النص يُنقّى تلقائياً قبل الإرسال.
      </p>
    </Modal>
  );
}
