// features/trash — سلة المحذوفات: كل ما حُذف (أدوية، جداول، تحاليل،
// أعراض، طعام) لمدة 30 يوماً، مع استرجاع فردي أو جماعي وحذف نهائي.

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/dexie/db';
import { bulkSoftDelete, purge, restore, softDelete, upsert } from '@/data/dexie/repos';
import { useUi } from '@/data/stores/ui';
import { Button, Card, Empty } from '@/ui/components';

interface Row {
  entity: 'meds' | 'schedules' | 'labResults' | 'symptoms' | 'foodLogs';
  label: string;
  entityLabel: string;
  id: string;
  deletedAt: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
}

const TTL_DAYS = 30;

export function TrashPage() {
  const { toast, askConfirm } = useUi();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  const meds = useLiveQuery(() => db.meds.toArray(), []) ?? [];
  const schedules = useLiveQuery(() => db.schedules.toArray(), []) ?? [];
  const labs = useLiveQuery(() => db.labResults.toArray(), []) ?? [];
  const symptoms = useLiveQuery(() => db.symptoms.toArray(), []) ?? [];
  const foods = useLiveQuery(() => db.foodLogs.toArray(), []) ?? [];

  const rows: Row[] = [
    ...meds.filter((m) => m.deletedAt).map((m) => ({ entity: 'meds' as const, id: m.id, label: m.nameAr, entityLabel: 'دواء', deletedAt: m.deletedAt!, raw: m })),
    ...schedules.filter((s) => s.deletedAt).map((s) => ({
      entity: 'schedules' as const, id: s.id,
      label: `جدول ${meds.find((m) => m.id === s.medId)?.nameAr ?? ''} (${s.times.join('، ')})`,
      entityLabel: 'جدول', deletedAt: s.deletedAt!, raw: s,
    })),
    ...labs.filter((l) => l.deletedAt).map((l) => ({ entity: 'labResults' as const, id: l.id, label: l.title, entityLabel: l.kind === 'lab' ? 'تحليل' : 'أشعة', deletedAt: l.deletedAt!, raw: l })),
    ...symptoms.filter((s) => s.deletedAt).map((s) => ({ entity: 'symptoms' as const, id: s.id, label: s.text, entityLabel: 'عرض', deletedAt: s.deletedAt!, raw: s })),
    ...foods.filter((f) => f.deletedAt).map((f) => ({ entity: 'foodLogs' as const, id: f.id, label: f.text, entityLabel: 'طعام', deletedAt: f.deletedAt!, raw: f })),
  ].sort((a, b) => b.deletedAt - a.deletedAt);

  const doRestore = async (r: Row) => {
    await restore(r.entity, r.id);
    toast(`أُرجع «${r.label}» ✓`);
  };

  const doPurge = async (r: Row) => {
    const yes = await askConfirm('حذف نهائي', `حذف «${r.label}» نهائياً؟ لا يمكن التراجع.`);
    if (!yes) return;
    await purge(r.entity, r.id);
    toast('حُذف نهائياً');
  };

  const bulkRestore = async () => {
    const chosen = rows.filter((r) => selected.has(key(r)));
    for (const r of chosen) await restore(r.entity, r.id);
    toast(`أُرجعت ${chosen.length} عناصر ✓`);
    setSelected(new Set());
    setBulkMode(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">سلة المحذوفات</h1>
          <p className="text-sm text-gray-400">تبقى العناصر {TTL_DAYS} يوماً ثم تُحذف نهائياً تلقائياً</p>
        </div>
        <Button variant={bulkMode ? 'primary' : 'ghost'} onClick={() => { setBulkMode(!bulkMode); setSelected(new Set()); }}>
          {bulkMode ? `استرجاع (${selected.size})` : 'استرجاع جماعي'}
        </Button>
      </div>

      {rows.length === 0 && <Empty icon="🗑️" title="السلة فارغة" hint="كل ما تحذفه يظهر هنا 30 يوماً" />}

      {bulkMode && selected.size > 0 && (
        <Button full className="mt-3" onClick={() => void bulkRestore()}>استرجاع المحدد ({selected.size})</Button>
      )}

      <div className="space-y-2 mt-3">
        {rows.map((r) => {
          const daysLeft = TTL_DAYS - Math.floor((Date.now() - r.deletedAt) / 86_400_000);
          return (
            <Card key={key(r)} className="p-3">
              <div className="flex items-center gap-3">
                {bulkMode && (
                  <input
                    type="checkbox"
                    checked={selected.has(key(r))}
                    onChange={(e) => {
                      const s = new Set(selected);
                      if (e.target.checked) s.add(key(r)); else s.delete(key(r));
                      setSelected(s);
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{r.label}</div>
                  <div className="text-[11px] text-gray-400">
                    {r.entityLabel} · حُذف {new Date(r.deletedAt).toLocaleString('ar-EG')} · يُحذف نهائياً بعد {Math.max(0, daysLeft)} يوم
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="soft" className="!py-1 !px-2 text-xs" onClick={() => void doRestore(r)}>استرجاع</Button>
                  <Button variant="ghost" className="!py-1 !px-2 text-xs text-red-600" onClick={() => void doPurge(r)}>نهائي</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function key(r: Row): string {
  return `${r.entity}/${r.id}`;
}

export { bulkSoftDelete, softDelete, upsert };
