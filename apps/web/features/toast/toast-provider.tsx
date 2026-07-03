"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type ToastVariant = "default" | "destructive";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastValue {
  toasts: Toast[];
  /** Raise a transient notification; auto-dismisses after a few seconds. */
  toast: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

/** How long a toast stays before auto-dismiss. */
const AUTO_DISMISS_MS = 5000;

/**
 * App-wide toast state. A dependency-free primitive (no external toast lib): holds
 * the active toasts, exposes `toast()` to raise one and auto-dismisses each after a
 * few seconds. Rendered by {@link Toaster}. Used for feedback that isn't tied to a
 * single form — e.g. the global session-expiry notice from the 401 handler.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Monotonic id source — avoids Math.random / Date so ids are stable and testable.
  const nextId = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "default") => {
      const id = String(nextId.current++);
      setToasts((prev) => [...prev, { id, message, variant }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  const value = useMemo<ToastValue>(() => ({ toasts, toast, dismiss }), [toasts, toast, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
