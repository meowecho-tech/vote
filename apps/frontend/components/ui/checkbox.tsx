"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  stopPropagation?: boolean;
  className?: string;
};

export function Checkbox({ checked, onCheckedChange, disabled = false, stopPropagation = false, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-pressed={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
        if (disabled) {
          return;
        }
        onCheckedChange(!checked);
      }}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-md border text-primary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary bg-primary text-primary-foreground" : "bg-card/90",
        className
      )}
    >
      {checked ? <Check className="h-3.5 w-3.5" /> : null}
    </button>
  );
}
