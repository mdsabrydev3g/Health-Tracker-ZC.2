// features/journal — سجل الأعراض والطعام: إضافة سريعة، وتأكيد قبل أي حذف
// (المرحلة 1: الأعراض والطعام كانت تُحذف بلا تأكيد — أُصلح ذلك).

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/dexie/db';
import { newId, softDelete, upsert } from '@/data/dexie/repos';
import { useSettings } from '@/data/stores/settings';
import { useSession } from '@/data/stores/session';
import { useUi } from '@/data/stores/ui';
import type { FoodLog, Symptom } from '@/core/schema/types';
import { Button, Card, Empty, Field, Modal, SectionTitle, SwipeRow, inputCls } from '@/ui/components';

type Tab = 'symptoms' | 'food';

export function JournalPage() {
  const [tab, setTab] = useState<Tab>('symptoms');
  const [adding, setAdding] = useState(false);
  const user = useSession((s) => s.user);
  const { activePersonId } = useSettings();
  const { askConfirm, undoable, toast } = useUi();

  const symptoms = useLiveQuery(() => db.symptoms.toArray(), []) ?? [];
  const foods = useLiveQuery(() => db.foodLogs.toArray(), []) ?? [];

  const visibleSy = symptoms.filter((s) => !s.deletedAt && (!activePersonId || s.personId === activePersonId)).sort((a, b) => b.at - a.at);
  const visibleFo = foods.filter((f) => !f.deletedAt && (!activePersonId || f.personId === activePersonId)).sort((a, b) => b.at - a.at);

  const delSymptom = async (s: Symptom) => {
    // تأكيد قبل حذف الأعراض (كان حذفاً مباشراً — أُصلح)
    const yes = await askConfirm('حذف عرض', `حذف «${s.text}» من السجل؟`);
    if (!yes) return;
    await softDelete('symptoms', s.id);
    undoable('حُذف العرض', async () => { await upsert('symptoms', { ...s, deletedAt: null }); });
  };

  const delFood = async (f: FoodLog) => {
    const yes = await askConfirm('حذف طعام', `حذف «${f.text}» من السجل؟`);
    if (!yes) return;
    await softDelete('foodLogs', f.id);
    undoable('حُذف بند الطعام', async () => { await upsert('foodLogs', { ...f, deletedAt: null }); });
  };

  const rows = tab === 'symptoms' ? visibleSy.map((s) => ({ id: s.id, at: s.at, text: s.text, sev: s.severity, del: () => void delSymptom(s) }))
    : visibleFo.map((f) => ({ id: f.id, at: f.at, text: f.text, sev: undefined, del: () => void delFood(f) }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">الأعراض والطعام</h1>
        <Button onClick={() => setAdding(true)}>+ إضافة</Button>
      </div>

      <div className="flex gap-2 mt-3">
        <Button variant={tab === 'symptoms' ? 'primary' : 'soft'} onClick={() => setTab('symptoms')}>أعراض ({visibleSy.length})</Button>
        <Button variant={tab === 'food' ? 'primary' : 'soft'} onClick={() => setTab('food')}>طعام ({visibleFo.length})</Button>
      </div>

      {rows.length === 0 && <Empty icon="📝" title="لا سجلات بعد" hint="سجّل ما تشعر به أو ما تتناوله لتستفيد منه مع الطبيب" />}

      <div className="space-y-2 mt-3">
        {rows.map((r) => (
          <SwipeRow key={r.id} onDelete={r.del}>
            <Card className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-gray-800 text-sm">{r.text}</div>
                <div className="text-[11px] text-gray-400">{new Date(r.at).toLocaleString('ar-EG')}</div>
              </div>
              {r.sev && <span className="text-xs">{'⚠'.repeat(r.sev)}</span>}
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={r.del}>حذف</Button>
              </div>
            </Card>
          </SwipeRow>
        ))}
      </div>

      {adding && (
        <AddDialog
          tab={tab}
          onClose={() => setAdding(false)}
          onSave={async (text, sev, kind) => {
            if (!user) return;
            const now = Date.now();
            if (tab === 'symptoms') {
              await upsert('symptoms', {
                id: newId('sym'), familyId: user.familyId,
                personId: activePersonId || user.personId || user.familyId,
                at: now, text, severity: sev, createdAt: now, updatedAt: now,
              });
            } else {
              await upsert('foodLogs', {
                id: newId('food'), familyId: user.familyId,
                personId: activePersonId || user.personId || user.familyId,
                at: now, text, kind, createdAt: now, updatedAt: now,
              });
            }
            toast('سُجّل ✓');
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddDialog({ tab, onClose, onSave }: {
  tab: Tab;
  onClose: () => void;
  onSave: (text: string, sev?: 1 | 2 | 3, kind?: 'meal' | 'drink' | 'note') => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [sev, setSev] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<'meal' | 'drink' | 'note'>('meal');
  return (
    <Modal open title={tab === 'symptoms' ? 'إضافة عرض' : 'إضافة طعام'} onClose={onClose}>
      <div className="space-y-3">
        <Field label={tab === 'symptoms' ? 'العرض (مثل: دوخة بعد الجرعة الصباحية)' : 'ماذا أكل/شرب؟'}>
          <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </Field>
        {tab === 'symptoms' ? (
          <Field label="الشدة">
            <div className="flex gap-2">
              {([1, 2, 3] as const).map((s) => (
                <button key={s} className={`px-3 py-1.5 rounded-xl text-sm ${sev === s ? 'bg-brand-700 text-white' : 'bg-gray-100'}`} onClick={() => setSev(s)}>
                  {'⚠'.repeat(s)}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <Field label="النوع">
            <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as 'meal' | 'drink' | 'note')}>
              <option value="meal">وجبة</option>
              <option value="drink">مشروب</option>
              <option value="note">ملاحظة</option>
            </select>
          </Field>
        )}
        <Button full disabled={!text.trim()} onClick={() => void onSave(text.trim(), tab === 'symptoms' ? sev : undefined, tab === 'food' ? kind : undefined)}>
          حفظ
        </Button>
      </div>
    </Modal>
  );
}

export { SectionTitle };
