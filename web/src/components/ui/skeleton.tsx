import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-gradient-to-r from-ink-700 via-ink-600 to-ink-700 bg-[length:200%_100%] animate-shimmer",
        className
      )}
      {...props}
    />
  );
}
