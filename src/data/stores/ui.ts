// stores/ui — Snackbar مع Undo (10 ثوانٍ)، تأكيدات الحذف، والحالة العامة.

import { create } from 'zustand';

export interface Snackbar {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (yes: boolean) => void;
}

interface UiState {
  snackbars: Snackbar[];
  confirm: ConfirmRequest | null;
  toast: (text: string, durationMs?: number) => void;
  /** يعرض Snackbar مع زر تراجع لمدة 10 ثوانٍ */
  undoable: (text: string, onAction: () => void) => void;
  dismiss: (id: number) => void;
  askConfirm: (title: string, message: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}

let nextId = 1;

export const useUi = create<UiState>((set) => ({
  snackbars: [],
  confirm: null,
  toast: (text, durationMs = 3500) => {
    const id = nextId++;
    set((s) => ({ snackbars: [...s.snackbars, { id, text, durationMs }] }));
  },
  undoable: (text, onAction) => {
    const id = nextId++;
    set((s) => ({
      snackbars: [
        ...s.snackbars,
        { id, text, actionLabel: 'تراجع', onAction, durationMs: 10_000 },
      ],
    }));
  },
  dismiss: (id) => set((s) => ({ snackbars: s.snackbars.filter((x) => x.id !== id) })),
  askConfirm: (title, message, opts) =>
    new Promise<boolean>((resolve) => {
      set({
        confirm: {
          title,
          message,
          confirmLabel: opts?.confirmLabel ?? 'تأكيد',
          danger: opts?.danger ?? true,
          resolve,
        },
      });
    }),
}));
