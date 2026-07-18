import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium font-mono tracking-wide",
  {
    variants: {
      variant: {
        neutral: "bg-ink-700 text-ink-200",
        ok: "bg-ok/10 text-ok",
        warn: "bg-warn/10 text-warn",
        danger: "bg-danger/10 text-danger",
        signal: "bg-signal-500/10 text-signal-500",
        stream: "bg-stream-500/10 text-stream-500",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
