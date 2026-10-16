"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastType = "error" | "success" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  pushToast: (message: string, type?: ToastType, durationMs?: number) => void;
  /** Remove a specific notification by id. Does not affect transaction state. */
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function iconForType(type: ToastType) {
  if (type === "error") return <AlertCircle size={16} className="text-red-400" />;
  if (type === "success") return <CheckCircle2 size={16} className="text-mint-500" />;
  return <Info size={16} className="text-brand-400" />;
}

function toastClasses(type: ToastType): string {
  if (type === "error") return "border-red-200 bg-red-50 text-red-900";
  if (type === "success") return "border-mint-500/30 bg-mint-50 text-mint-900";
  return "border-brand-200 bg-brand-50 text-brand-900";
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // removeToast is the single removal primitive used by both the auto-timeout
  // and the manual dismiss control. Defined once so neither caller holds a
  // stale reference.
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, type: ToastType = "info", durationMs = 5000) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      window.setTimeout(() => removeToast(id), durationMs);
    },
    [removeToast]
  );

  // dismissToast is exposed on the context so callers (and tests) can remove
  // a notification imperatively. Dismissing feedback never touches transaction
  // state — it only filters the local toasts array.
  const dismissToast = useCallback((id: string) => removeToast(id), [removeToast]);

  const value = useMemo<ToastContextValue>(
    () => ({ pushToast, dismissToast }),
    [pushToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        The outer container is pointer-events-none so it doesn't block page
        content below it.  Each individual toast re-enables pointer events for
        itself so the dismiss button and any links inside remain clickable.
      */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 top-20 z-[100] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${toastClasses(toast.type)}`}
            role={toast.type === "error" ? "alert" : "status"}
          >
            <span className="mt-0.5" aria-hidden="true">{iconForType(toast.type)}</span>
            <p className="flex-1 text-sm">{toast.message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => removeToast(toast.id)}
              className="text-current/70 hover:text-current"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
