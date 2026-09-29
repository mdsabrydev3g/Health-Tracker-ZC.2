// app/shell — هيكل التنقل: شريط جانبي على سطح المكتب وأسفل الشاشة للموبايل.
// في وضع الوالدة تُبسَّط القوائم (اليوم + المزيد فقط).

import { useState } from 'react';
import clsx from 'clsx';
import { useSettings } from '@/data/stores/settings';
import { TodayPage } from '@/features/today/TodayPage';
import { MedsPage } from '@/features/meds/MedsPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { LabsPage } from '@/features/labs/LabsPage';
import { JournalPage } from '@/features/journal/JournalPage';
import { TrashPage } from '@/features/trash/TrashPage';
import { MorePage } from '@/features/more/MorePage';
import { SyncFab } from './SyncFab';

export type Tab = 'today' | 'meds' | 'inventory' | 'labs' | 'journal' | 'trash' | 'more';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'اليوم', icon: '☀️' },
  { id: 'meds', label: 'الأدوية والجداول', icon: '💊' },
  { id: 'inventory', label: 'المخزون', icon: '📦' },
  { id: 'labs', label: 'التحاليل والأشعة', icon: '🧪' },
  { id: 'journal', label: 'الأعراض والطعام', icon: '📝' },
  { id: 'trash', label: 'سلة المحذوفات', icon: '🗑️' },
  { id: 'more', label: 'المزيد', icon: '⚙️' },
];

export function Shell() {
  const [tab, setTab] = useState<Tab>('today');
  const mode = useSettings((s) => s.mode);
  const tabs = mode === 'mother' ? TABS.filter((t) => t.id === 'today' || t.id === 'more') : TABS;

  const page = (() => {
    switch (tab) {
      case 'today': return <TodayPage />;
      case 'meds': return <MedsPage />;
      case 'inventory': return <InventoryPage />;
      case 'labs': return <LabsPage />;
      case 'journal': return <JournalPage />;
      case 'trash': return <TrashPage />;
      case 'more': return <MorePage />;
    }
  })();

  return (
    <div className="min-h-screen flex" dir="rtl">
      {/* شريط جانبي — سطح المكتب */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white border-l border-gray-200 p-3 gap-1">
        <div className="flex items-center gap-2 px-2 py-4">
          <span className="text-2xl">💊</span>
          <div>
            <div className="font-bold text-gray-800">رفيق الصحة</div>
            <div className="text-[11px] text-gray-400">
              {mode === 'mother' ? 'وضع الوالدة' : 'وضع المالك'}
            </div>
          </div>
        </div>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-right transition-colors',
              tab === t.id ? 'bg-brand-50 text-brand-800 font-bold' : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </aside>

      {/* المحتوى */}
      <main className="flex-1 min-w-0 pb-24 md:pb-6">
        <div className="max-w-3xl mx-auto px-4 py-4">{page}</div>
      </main>

      <SyncFab />

      {/* شريط سفلي — موبايل */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px]',
                tab === t.id ? 'text-brand-700 font-bold' : 'text-gray-400',
              )}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
