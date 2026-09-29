// modes/ModeGate — نافذة اختيار الوضع (أول مرة فقط): من يستخدم هذا الجهاز؟
//  • وضع الوالدة: منبّه كامل + إشعارات لكل جرعة ولكل نفاد.
//  • وضع المالك/الابن: إشعارات فقط، والتنبيه العاجل فقط لنفاد دواء هام.

import { useState } from 'react';
import { Modal, Button } from '@/ui/components';
import { useSettings } from '@/data/stores/settings';
import { useSession } from '@/data/stores/session';
import { runNotificationCycle } from '@/data/notify/service';

export function ModeGate() {
  const { mode, loaded, setMode } = useSettings();
  const user = useSession((s) => s.user);
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);

  if (!loaded || !user) return null;
  if (!asked && !localStorage.getItem('mode_chosen')) {
    if (!open) setOpen(true);
    setAsked(true);
  }

  const choose = async (m: 'mother' | 'owner') => {
    await setMode(m);
    localStorage.setItem('mode_chosen', '1');
    setOpen(false);
    void runNotificationCycle();
  };

  return (
    <Modal open={open} title="من يستخدم هذا الجهاز؟" onClose={() => { setOpen(false); localStorage.setItem('mode_chosen', '1'); }}>
      <div className="space-y-3">
        <button
          className="w-full text-right rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-4 hover:border-brand-500"
          onClick={() => void choose('mother')}
        >
          <div className="font-bold text-gray-800">👩 وضع الوالدة</div>
          <p className="text-sm text-gray-500 mt-1 leading-6">
            منبّه صوتي كامل لكل جرعة، وإشعارات لكل نفاد دواء. الصفحة مُبسَّطة: اليوم فقط.
          </p>
        </button>
        <button
          className="w-full text-right rounded-2xl border-2 border-gray-200 p-4 hover:border-brand-400"
          onClick={() => void choose('owner')}
        >
          <div className="font-bold text-gray-800">🧑 وضع الابن/المالك</div>
          <p className="text-sm text-gray-500 mt-1 leading-6">
            إشعارات فقط لأخذ الجرعات وفواتها، والتنبيه العاجل (بمنبّه) فقط عند اقتراب نفاد دواء هام.
            كل الأقسام متاحة: أدوية، جداول، مخزون، تحاليل، سلة.
          </p>
        </button>
        <p className="text-xs text-gray-400">يمكن تغيير الوضع لاحقاً من «المزيد ← الوضع والإشعارات».</p>
      </div>
    </Modal>
  );
}
