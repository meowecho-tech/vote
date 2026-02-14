"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function createToastId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getVariantClass(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return "border-emerald-300/70 bg-emerald-50/95 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/85 dark:text-emerald-100";
    case "error":
      return "border-red-300/70 bg-red-50/95 text-red-900 dark:border-red-900/70 dark:bg-red-950/85 dark:text-red-100";
    default:
      return "border-blue-300/70 bg-blue-50/95 text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/85 dark:text-blue-100";
  }
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success") {
    return <CheckCircle2 className="h-4 w-4 shrink-0" />;
  }

  if (variant === "error") {
    return <XCircle className="h-4 w-4 shrink-0" />;
  }

  return <Info className="h-4 w-4 shrink-0" />;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const item: ToastItem = {
        id: createToastId(),
        title: input.title,
        description: input.description,
        variant: input.variant ?? "info",
        durationMs: input.durationMs ?? 4200,
      };

      setItems((prev) => [...prev, item]);
      window.setTimeout(() => dismiss(item.id), item.durationMs);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, variant: "success" }),
      error: (title, description) => toast({ title, description, variant: "error" }),
      info: (title, description) => toast({ title, description, variant: "info" }),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto rounded-xl border px-3 py-2 shadow-lg backdrop-blur-sm",
              getVariantClass(item.variant)
            )}
          >
            <div className="flex items-start gap-2">
              <ToastIcon variant={item.variant} />
              <div className="flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.description ? <p className="mt-0.5 text-xs opacity-85">{item.description}</p> : null}
              </div>
              <button
                type="button"
                className="rounded p-0.5 opacity-70 transition hover:opacity-100"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
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
