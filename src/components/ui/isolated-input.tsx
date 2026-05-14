import * as React from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

export interface IsolatedInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
}

export const IsolatedInput = React.forwardRef<HTMLInputElement, IsolatedInputProps>(
  ({ className, value, onValueChange, onFocus, onBlur, ...props }, forwardedRef) => {
    const [localValue, setLocalValue] = React.useState(value);

    // Sync from props if external value changes (e.g., template load)
    React.useEffect(() => {
      setLocalValue(value);
    }, [value]);

    const handleFocus = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      const el = e.target;
      el.scrollIntoView({ block: "center", behavior: "instant" });
      
      // Cursor lock system
      setTimeout(() => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        if (rect.bottom > viewportHeight) {
          window.scrollBy({
            top: rect.bottom - viewportHeight + 20,
            behavior: "instant",
          });
        }
      }, 50);

      if (onFocus) onFocus(e);
    }, [onFocus]);

    const handleBlur = React.useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      // Commit the change on blur synchronously
      if (localValue !== value) {
        flushSync(() => {
          onValueChange(localValue);
        });
      }
      if (onBlur) onBlur(e);
    }, [localValue, value, onValueChange, onBlur]);
    
    const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        if (localValue !== value) {
          flushSync(() => {
            onValueChange(localValue);
          });
        }
      }
      if (props.onKeyDown) props.onKeyDown(e);
    }, [localValue, value, onValueChange, props]);

    return (
      <input
        ref={forwardedRef}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);

IsolatedInput.displayName = "IsolatedInput";
