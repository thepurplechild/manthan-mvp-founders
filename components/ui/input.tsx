import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
  return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border-2 border-manthan-saffron-200/50 bg-white/70 px-4 py-2 text-base shadow-sm transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-manthan-charcoal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-manthan-teal-500 focus:border-manthan-teal-500 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
