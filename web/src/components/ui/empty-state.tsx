import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-600 px-6 py-14 text-center",
        className
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-700 text-ink-300">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="font-display text-sm font-medium text-ink-100">{title}</p>
        <p className="max-w-xs text-xs text-ink-400">{description}</p>
      </div>
      {action}
    </div>
  );
}
