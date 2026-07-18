import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 text-sm text-ink-50 placeholder:text-ink-400 outline-none transition-colors focus:border-signal-500 focus:ring-1 focus:ring-signal-500",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none rounded-lg border border-ink-600 bg-ink-900 px-3 py-2.5 text-sm text-ink-50 placeholder:text-ink-400 outline-none transition-colors focus:border-signal-500 focus:ring-1 focus:ring-signal-500",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 text-sm text-ink-50 outline-none transition-colors focus:border-signal-500 focus:ring-1 focus:ring-signal-500",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";
