"use client";

/**
 * Lightweight toast system used for transient status updates that should
 * NOT pollute the chat thread — rewrite confirmations, skip notices, score
 * change callouts, save confirmations.
 *
 * Usage:
 *   const toasts = useToasts();
 *   toasts.push({ kind: "success", text: "Rewrote bullet (+4 pts)" });
 *
 * Single queue, slide-in from the right, auto-dismiss after 3s.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X, AlertCircle, ArrowUp } from "lucide-react";

export type ToastKind = "success" | "info" | "warn" | "score";

export interface ToastSpec {
  id: string;
  kind: ToastKind;
  text: string;
  /** Optional small bold prefix (e.g. "+4 pts"). */
  badge?: string;
  /** ms before auto-dismiss. Default 3000. */
  durationMs?: number;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastSpec[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) clearTimeout(handle);
    timers.current.delete(id);
  }, []);

  const push = useCallback((spec: Omit<ToastSpec, "id"> & { id?: string }) => {
    const id = spec.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { ...spec, id }]);
    const dur = spec.durationMs ?? 3000;
    const handle = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, dur);
    timers.current.set(id, handle);
    return id;
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((h) => clearTimeout(h));
      map.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}

export default function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastSpec[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
      <style jsx>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastSpec; onDismiss: () => void }) {
  const palette = paletteFor(toast.kind);
  const Icon = palette.icon;
  return (
    <div
      role="status"
      onClick={onDismiss}
      className="pointer-events-auto cursor-pointer flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border max-w-sm"
      style={{
        background: palette.bg,
        borderColor: palette.border,
        animation: "toast-in 220ms ease-out",
      }}
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: palette.iconBg }}
      >
        <Icon size={14} strokeWidth={2.25} color={palette.iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        {toast.badge && (
          <span
            className="inline-block text-[11px] font-semibold mr-2"
            style={{ color: palette.badge }}
          >
            {toast.badge}
          </span>
        )}
        <span className="text-sm" style={{ color: palette.text }}>{toast.text}</span>
      </div>
    </div>
  );
}

function paletteFor(kind: ToastKind) {
  switch (kind) {
    case "success":
      return { icon: Check, bg: "#ffffff", border: "#bbf7d0", iconBg: "#dcfce7", iconColor: "#15803d", text: "#18181b", badge: "#15803d" };
    case "score":
      return { icon: ArrowUp, bg: "#ffffff", border: "#bbf7d0", iconBg: "#dcfce7", iconColor: "#15803d", text: "#18181b", badge: "#15803d" };
    case "warn":
      return { icon: AlertCircle, bg: "#ffffff", border: "#fde68a", iconBg: "#fef3c7", iconColor: "#b45309", text: "#18181b", badge: "#b45309" };
    case "info":
    default:
      return { icon: X, bg: "#ffffff", border: "#e5e7eb", iconBg: "#f4f4f5", iconColor: "#52525b", text: "#18181b", badge: "#52525b" };
  }
}
