import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

type ErrorAlertProps = {
  message: string;
  title?: string;
  className?: string;
};

export function ErrorAlert({ message, title = "Request failed", className }: ErrorAlertProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200",
        className
      )}
      role="alert"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {title}
      </p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}
