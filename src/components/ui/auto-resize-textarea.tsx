import * as React from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

export interface AutoResizeTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  onTypingStateChange?: (isTyping: boolean) => void;
}

export const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ className, onValueChange, onFocus, onBlur, value, onTypingStateChange, ...props }, forwardedRef) => {
    const internalRef = React.useRef<HTMLTextAreaElement>(null);
    const ref = (forwardedRef || internalRef) as React.MutableRefObject<HTMLTextAreaElement | null>;
    const [localValue, setLocalValue] = React.useState(value);

    // Sync from props if external value changes (e.g., template load)
    React.useEffect(() => {
      setLocalValue(value);
    }, [value]);

    const handleInput = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const el = e.target;
      const prev = el.style.height;
      el.style.height = "auto";
      const next = `${el.scrollHeight}px`;
      
      if (prev !== next) {
        el.style.height = next;
      } else {
        el.style.height = prev;
      }
      
      setLocalValue(el.value);
    }, []);

    const handleFocus = React.useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (onTypingStateChange) onTypingStateChange(true);
      
      const el = e.target;
      // Scroll into view instantly, avoiding smooth scrolling animation conflicts
      el.scrollIntoView({ block: "center", behavior: "instant" });
      
      // Cursor lock: check a bit later to ensure it hasn't drifted under keyboard
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
    }, [onFocus, onTypingStateChange]);

    const handleBlur = React.useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (onTypingStateChange) onTypingStateChange(false);
      
      // Commit the change on blur synchronously
      if (localValue !== value) {
        flushSync(() => {
          onValueChange(localValue);
        });
      }
      if (onBlur) onBlur(e);
    }, [localValue, value, onValueChange, onBlur, onTypingStateChange]);

    // Initial resize
    React.useEffect(() => {
      if (ref.current) {
        ref.current.style.height = "auto";
        ref.current.style.height = `${ref.current.scrollHeight}px`;
      }
    }, [localValue, ref]);

    return (
      <textarea
        ref={ref}
        value={localValue}
        onChange={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          "flex w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          "resize-none overflow-hidden", // crucial for auto-resize
          className
        )}
        {...props}
      />
    );
  }
);

AutoResizeTextarea.displayName = "AutoResizeTextarea";
