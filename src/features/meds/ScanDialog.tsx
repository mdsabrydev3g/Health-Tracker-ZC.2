// features/meds/ScanDialog — مسح علبة الدواء: QR/DataMatrix/باركود.
//  • GS1: يستخرج GTIN وتاريخ الانتهاء والتشغيلة → تعبئة تلقائية.
//  • جدول التعلّم gtins: إن عُرف الـ GTIN سابقاً يملأ الاسم والمادة فعلياً.
//  • إن لم يُعرف: خيار تحليل صورة العلبة بالذكاء الاصطناعي (بموافقة صريحة)
//    أو الإدخال اليدوي. المستخدم يراجع ويؤكد قبل الحفظ دائماً.

import { useEffect, useRef, useState } from 'react';
import { parseBarcode, normalizeGtin } from '@/core/barcode/gs1';
import { medboxVisionUserPrompt, safetySystemPrompt } from '@/core/ai';
import { db } from '@/data/dexie/db';
import { upsert, newId } from '@/data/dexie/repos';
import { aiRun } from '@/data/ai/client';
import { useSession } from '@/data/stores/session';
import { useUi } from '@/data/stores/ui';
import type { GtinEntry, MedForm } from '@/core/schema/types';
import { Button, Field, Modal, inputCls } from '@/ui/components';

interface Draft {
  gtin?: string;
  expiry?: string;
  batch?: string;
  nameAr?: string;
  nameEn?: string;
  activeIngredient?: string;
  strength?: string;
  form?: MedForm;
  known: boolean; // وجدنا في جدول التعلّم؟
}

export function ScanDialog({ onClose, onLearned }: {
  onClose: () => void;
  onLearned: (entry: GtinEntry) => Promise<void>;
}) {
  const { toast } = useUi();
  const user = useSession((s) => s.user);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manual, setManual] = useState('');
  const [status, setStatus] = useState('');
  const [visionBusy, setVisionBusy] = useState(false);
  const scanningRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode('scan-box');
        if (dead) return;
        scanningRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 200 } },
          (decodedText: string) => {
            const parsed = parseBarcode(decodedText);
            void handleResult(parsed);
            void scanner.stop().catch(() => undefined);
          },
          () => undefined, // أخطاء الإطارات المتكررة — نتجاهلها
        );
      } catch {
        setStatus('تعذر فتح الكاميرا — أدخل رقم الباركود يدوياً.');
      }
    })();
    return () => {
      dead = true;
      void scanningRef.current?.stop?.().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResult = async (parsed: ReturnType<typeof parseBarcode>) => {
    const gtin = parsed.gtin ?? parsed.ean;
    const known = gtin ? await db.gtins.get(normalizeGtin(gtin)) : undefined;
    setDraft({
      gtin: gtin ? normalizeGtin(gtin) : undefined,
      expiry: parsed.expiry,
      batch: parsed.batch,
      nameAr: known?.nameAr,
      nameEn: known?.nameEn,
      activeIngredient: known?.activeIngredient,
      strength: known?.strength,
      form: known?.form,
      known: Boolean(known),
    });
    if (!gtin && !parsed.expiry) {
      setStatus('لم يتعرّف على رمز GS1 — جرّب الإدخال اليدوي أو تحليل الصورة.');
    }
  };

  const visionAnalyze = async () => {
    // التقاط لقطة من الكاميرا داخل مربع المسح (إن أمكن) أو يستخدم الملف المرفق لاحقاً
    setVisionBusy(true);
    try {
      const canvas = boxRef.current?.querySelector('video') as HTMLVideoElement | null;
      let dataUrl: string | undefined;
      if (canvas && canvas.videoWidth) {
        const c = document.createElement('canvas');
        c.width = canvas.videoWidth;
        c.height = canvas.videoHeight;
        c.getContext('2d')!.drawImage(canvas, 0, 0);
        dataUrl = c.toDataURL('image/jpeg', 0.85);
      }
      if (!dataUrl) {
        setStatus('لا توجد لقطة كاميرا — صوّر العلبة وأضفها من شاشة التحليلات.');
        return;
      }
      const res = await aiRun('/ai/summarize', {
        capability: 'medbox_vision',
        messages: [safetySystemPrompt('ar'), medboxVisionUserPrompt()],
        fileDataUrl: dataUrl,
        fileMime: 'image/jpeg',
      });
      const j = parseJsonLoose(res.text);
      if (!j) {
        setStatus('لم يستطع تحليل الصورة — أدخل البيانات يدوياً.');
        return;
      }
      setDraft((d) => ({
        ...d,
        nameAr: j.nameAr || d?.nameAr,
        nameEn: j.nameEn || d?.nameEn,
        activeIngredient: j.activeIngredient || d?.activeIngredient,
        strength: j.strength || d?.strength,
        gtin: j.gtin || d?.gtin,
        expiry: j.expiry || d?.expiry,
        batch: j.batch || d?.batch,
        form: (j.form as MedForm) || d?.form,
        known: false,
      }));
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setVisionBusy(false);
    }
  };

  const saveAsMed = async () => {
    if (!user || !draft) return;
    if (!draft.nameAr && !draft.gtin) {
      toast('لا توجد بيانات كافية للحفظ');
      return;
    }
    // 1) حفظ في جدول التعلّم
    if (draft.gtin && draft.nameAr) {
      await onLearned({
        gtin: draft.gtin,
        nameAr: draft.nameAr,
        nameEn: draft.nameEn,
        activeIngredient: draft.activeIngredient,
        strength: draft.strength,
        form: draft.form,
        source: draft.known ? 'manual' : 'scan',
        confirmedAt: Date.now(),
      });
    }
    // 2) إنشاء دواء جديد بمراجعة المستخدم
    await upsert('meds', {
      id: newId('med'),
      familyId: user.familyId,
      personId: user.personId ?? user.familyId,
      nameAr: draft.nameAr || `دواء ${draft.gtin ?? ''}`,
      nameEn: draft.nameEn,
      activeIngredient: draft.activeIngredient,
      strength: draft.strength,
      form: draft.form ?? 'tablet',
      doseUnit: draft.form === 'syrup' ? 'ml' : draft.form === 'drops' ? 'drop' : 'tablet',
      isImportant: false,
      isChronic: false,
      prn: false,
      gtin: draft.gtin,
      barcode: draft.gtin,
      packExpiry: draft.expiry ? new Date(draft.expiry).getTime() : undefined,
      packBatch: draft.batch,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    toast('حُفظ الدواء من المسح ✓ (راجعه في صفحة الأدوية)');
    onClose();
  };

  return (
    <Modal open title="مسح علبة الدواء" onClose={onClose} wide>
      <div className="space-y-3">
        <div id="scan-box" ref={boxRef} className="rounded-xl overflow-hidden bg-black min-h-48" />
        {status && <p className="text-sm text-orange-600">{status}</p>}

        {!draft && (
          <div className="flex gap-2">
            <input className={inputCls} placeholder="أدخل رقم الباركود/GTIN يدوياً" value={manual} onChange={(e) => setManual(e.target.value)} />
            <Button onClick={() => void handleResult(parseBarcode(manual))}>تحليل</Button>
          </div>
        )}

        {draft && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center gap-2 text-sm">
              {draft.known ? (
                <span className="text-green-700 font-medium">✓ دواء معروف من عمليات المسح السابقة</span>
              ) : (
                <span className="text-orange-600">لم يتعرّف على الدواء تلقائياً — راجع وأكمل يدوياً</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="GTIN"><input className={inputCls} value={draft.gtin ?? ''} onChange={(e) => setDraft({ ...draft, gtin: e.target.value })} /></Field>
              <Field label="تاريخ انتهاء العلبة"><input className={inputCls} type="date" value={draft.expiry ?? ''} onChange={(e) => setDraft({ ...draft, expiry: e.target.value })} /></Field>
              <Field label="التشغيلة"><input className={inputCls} value={draft.batch ?? ''} onChange={(e) => setDraft({ ...draft, batch: e.target.value })} /></Field>
              <Field label="الاسم (عربي)"><input className={inputCls} value={draft.nameAr ?? ''} onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })} /></Field>
              <Field label="الاسم (إنجليزي)"><input className={inputCls} value={draft.nameEn ?? ''} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} /></Field>
              <Field label="المادة الفعالة"><input className={inputCls} value={draft.activeIngredient ?? ''} onChange={(e) => setDraft({ ...draft, activeIngredient: e.target.value })} /></Field>
              <Field label="التركيز"><input className={inputCls} value={draft.strength ?? ''} onChange={(e) => setDraft({ ...draft, strength: e.target.value })} /></Field>
              <Field label="الشكل">
                <select className={inputCls} value={draft.form ?? ''} onChange={(e) => setDraft({ ...draft, form: (e.target.value || undefined) as MedForm | undefined })}>
                  <option value="">—</option>
                  <option value="tablet">قرص</option>
                  <option value="capsule">كبسولة</option>
                  <option value="syrup">شراب</option>
                  <option value="drops">قطرة</option>
                  <option value="injection">حقن</option>
                </select>
              </Field>
            </div>
            {!draft.known && !draft.nameAr && (
              <Button variant="soft" full onClick={() => void visionAnalyze()} disabled={visionBusy}>
                {visionBusy ? 'جارٍ تحليل صورة العلبة…' : 'تحليل صورة العلبة بالذكاء الاصطناعي (بموافقة)'}
              </Button>
            )}
            <div className="flex gap-2">
              <Button full onClick={() => void saveAsMed()}>مراجعة وحفظ كدواء</Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>مسح آخر</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function parseJsonLoose(text: string): Record<string, string> | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, string>;
  } catch {
    return null;
  }
}
