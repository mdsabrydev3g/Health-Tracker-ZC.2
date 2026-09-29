// features/labs — التحاليل والأشعة: رفع ملف، ملخص AI بموافقة صريحة،
// القيم مقابل النطاق الطبيعي، وحفظ الملخص مع بند التحليل نفسه.
// تنبيه إلزامي مع كل نتيجة: «مساعد وليس تشخيصاً طبياً».

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/dexie/db';
import { softDelete, upsert, newId } from '@/data/dexie/repos';
import { useSettings } from '@/data/stores/settings';
import { useSession } from '@/data/stores/session';
import { useUi } from '@/data/stores/ui';
import { aiRun } from '@/data/ai/client';
import { safetySystemPrompt, labSummaryUserPrompt, clampText, redactText, duplicateIngredientWarning } from '@/core/ai';
import type { LabResult, LabValue } from '@/core/schema/types';
import { Badge, Button, Card, Empty, Field, Modal, SectionTitle, inputCls } from '@/ui/components';
import { ChatPanel } from './ChatPanel';

export function LabsPage() {
  const user = useSession((s) => s.user);
  const { activePersonId } = useSettings();
  const { askConfirm, undoable } = useUi();
  const meds = useLiveQuery(() => db.meds.toArray(), []) ?? [];
  const labs = useLiveQuery(() => db.labResults.toArray(), []) ?? [];
  const [adding, setAdding] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const visible = labs
    .filter((l) => !l.deletedAt && (!activePersonId || l.personId === activePersonId))
    .sort((a, b) => b.date - a.date);

  const dupeWarnings = duplicateIngredientWarning(meds.filter((m) => !m.deletedAt));

  const del = async (l: LabResult) => {
    const yes = await askConfirm('حذف تحليل', `حذف «${l.title}»؟ ستجده في سلة المحذوفات.`);
    if (!yes) return;
    await softDelete('labResults', l.id);
    undoable(`حُذف «${l.title}»`, async () => { await upsert('labResults', { ...l, deletedAt: null }); });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">التحاليل والأشعة</h1>
        <div className="flex gap-2">
          <Button variant="soft" onClick={() => setChatOpen(true)}>💬 مساعد</Button>
          <Button onClick={() => setAdding(true)}>+ إضافة</Button>
        </div>
      </div>

      {dupeWarnings.length > 0 && (
        <Card className="p-3 mt-3 border-yellow-200 bg-yellow-50">
          <div className="text-sm font-bold text-yellow-800 mb-1">⚠ مادة فعالة مكررة بين أدويتك</div>
          {dupeWarnings.map((w, i) => <p key={i} className="text-xs text-yellow-700">{w}</p>)}
          <p className="text-[11px] text-yellow-600 mt-1">تحقق مع طبيبك أو الصيدلي — هذا تنبيه تنظيمي وليس رأياً طبياً.</p>
        </Card>
      )}

      {visible.length === 0 && <Empty icon="🧪" title="لا تحاليل بعد" hint="أضف تقرير تحليل أو أشعة واطلب ملخصاً بلغة بسيطة" />}

      <div className="space-y-3 mt-3">
        {visible.map((l) => <LabCard key={l.id} lab={l} onDelete={() => void del(l)} />)}
      </div>

      {adding && <LabForm onClose={() => setAdding(false)} />}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </div>
  );
}

function LabCard({ lab, onDelete }: { lab: LabResult; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useUi((s) => s.toast);

  const summarize = async () => {
    setBusy(true);
    try {
      const res = await aiRun('/ai/summarize', {
        capability: lab.kind === 'lab' ? 'summarize_lab' : 'summarize_imaging',
        messages: [safetySystemPrompt('ar'), labSummaryUserPrompt(lab.title, lab.kind)],
        fileDataUrl: lab.fileDataUrl,
        fileMime: lab.fileType,
      });
      await upsert('labResults', {
        ...lab,
        aiSummary: res.text,
        aiProvider: res.provider,
        aiAt: Date.now(),
        consentAt: Date.now(),
      });
      toast('حُفظ الملخص مع التحليل ✓');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between" onClick={() => setOpen(!open)}>
        <div>
          <div className="font-bold text-gray-800">
            {lab.kind === 'lab' ? '🧪' : '🩻'} {lab.title}
          </div>
          <div className="text-xs text-gray-400">{new Date(lab.date).toLocaleDateString('ar-EG')}{lab.fileName ? ` · ${lab.fileName}` : ''}</div>
        </div>
        <div className="flex items-center gap-2">
          {lab.aiSummary && <Badge color="teal">ملخص ✓</Badge>}
          <span className="text-gray-300">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t pt-3 space-y-3">
          {lab.fileDataUrl && (
            lab.fileType?.startsWith('image/')
              ? <img src={lab.fileDataUrl} alt={lab.title} className="max-h-72 rounded-xl" />
              : <p className="text-xs text-gray-400">الملف: {lab.fileName}</p>
          )}

          {/* تنبيه إلزامي دائم */}
          <div className="rounded-xl bg-red-50 border border-red-100 p-2 text-[11px] text-red-700">
            ⚠ هذا المساعد للتنظيم والقراءة فقط وليس تشخيصاً طبياً — لا يبدّل رأي الطبيب.
            لا يُسمح له باقتراح تغيير جرعة أو إيقاف أي دواء.
          </div>

          {lab.values && lab.values.length > 0 && <ValuesTable values={lab.values} />}

          {lab.aiSummary && (
            <div className="rounded-xl bg-brand-50 p-3 text-sm whitespace-pre-wrap leading-6">{lab.aiSummary}</div>
          )}
          {lab.aiSummary && lab.aiAt && (
            <p className="text-[10px] text-gray-400">بواسطة {lab.aiProvider} · {new Date(lab.aiAt).toLocaleString('ar-EG')}</p>
          )}
          {!lab.aiSummary && (
            <Button variant="soft" onClick={() => void summarize()} disabled={busy}>
              {busy ? 'جارٍ التحليل… (بعد موافقتك)' : 'طلب ملخص AI (يتطلب موافقة)'}
            </Button>
          )}
          {lab.aiSummary && (
            <Button variant="ghost" onClick={() => void summarize()} disabled={busy}>إعادة التحليل</Button>
          )}
          <div className="flex justify-start">
            <Button variant="ghost" className="text-red-600" onClick={onDelete}>حذف</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ValuesTable({ values }: { values: LabValue[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs">
            <th className="text-right py-1">التحليل</th>
            <th className="text-right py-1">القيمة</th>
            <th className="text-right py-1">الطبيعي</th>
          </tr>
        </thead>
        <tbody>
          {values.map((v, i) => {
            const num = Number(v.value);
            const out = !isNaN(num) && ((v.refLow !== undefined && num < v.refLow) || (v.refHigh !== undefined && num > v.refHigh));
            return (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-1.5">{v.name}</td>
                <td className="py-1.5 nums">
                  {v.value} {v.unit ?? ''}
                  {out && <Badge color="red">خارج النطاق ⚠</Badge>}
                </td>
                <td className="py-1.5 text-gray-400 nums">{v.refLow !== undefined || v.refHigh !== undefined ? `${v.refLow ?? '—'} – ${v.refHigh ?? '—'}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LabForm({ onClose }: { onClose: () => void }) {
  const user = useSession((s) => s.user);
  const { activePersonId } = useSettings();
  const toast = useUi((s) => s.toast);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'lab' | 'imaging'>('lab');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<{ name: string; type: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (f: File | null) => {
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) {
      toast('الملف أكبر من 6 ميجابايت');
      return;
    }
    setBusy(true);
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(f);
    });
    setFile({ name: f.name, type: f.type, dataUrl });
    setBusy(false);
  };

  const save = async () => {
    if (!user || !title.trim()) return;
    await upsert('labResults', {
      id: newId('lab'),
      familyId: user.familyId,
      personId: activePersonId || user.personId || user.familyId,
      title: title.trim(),
      kind,
      date: new Date(date).getTime(),
      fileName: file?.name,
      fileType: file?.type,
      fileDataUrl: file?.dataUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    toast('حُفظ — يمكنك طلب ملخص AI الآن');
    onClose();
  };

  return (
    <Modal open title="إضافة تحليل / أشعة" onClose={onClose}>
      <div className="space-y-3">
        <Field label="العنوان"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="النوع">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as 'lab' | 'imaging')}>
            <option value="lab">تحاليل مخبرية</option>
            <option value="imaging">أشعة / تصوير</option>
          </select>
        </Field>
        <Field label="التاريخ"><input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="الملف (صورة أو PDF)" hint="يُقرأ بالذكاء الاصطناعي بعد موافقتك">
          <input type="file" accept="image/*,.pdf" className="text-sm" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
        </Field>
        {busy && <p className="text-xs text-gray-400">جارٍ قراءة الملف…</p>}
        {file && file.type.startsWith('image/') && <img src={file.dataUrl} className="max-h-48 rounded-xl" alt="معاينة" />}
        <Button full onClick={() => void save()}>حفظ</Button>
        <p className="text-[11px] text-gray-400 leading-5">
          النص المستخرج يُنقّى من المعرفات والهواتف قبل الإرسال، ولا يُرسل أي ملف إلا بعد موافقتك الصريحة.
          {file?.type === 'application/pdf' ? ' ملفات PDF تُحلَّل عبر السيرفر (Gemini) مباشرة.' : ''}
        </p>
      </div>
    </Modal>
  );
}

export { clampText, redactText };
