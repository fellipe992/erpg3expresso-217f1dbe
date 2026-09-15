import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & { uppercase?: boolean }
>(({ className, uppercase = true, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (uppercase) {
        const maiusculo = e.target.value.toUpperCase();
        if (e.target.value !== maiusculo) {
          const pos = e.target.selectionStart;
          e.target.value = maiusculo;
          if (pos !== null) e.target.setSelectionRange(pos, pos);
        }
      }
      onChange?.(e);
    };

    return (
      <textarea
        onChange={handleChange}
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
