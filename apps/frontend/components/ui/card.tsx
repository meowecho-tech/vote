import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "panel-muted rounded-2xl border border-border/70 bg-card/90 p-6 text-card-foreground shadow-[0_24px_55px_-38px_rgba(15,23,42,0.65)] backdrop-blur-sm transition-shadow duration-200 hover:shadow-[0_30px_60px_-38px_rgba(29,78,216,0.45)]",
        className
      )}
      {...props}
    />
  );
}
