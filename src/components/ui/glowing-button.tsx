"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function hexToRgba(hex: string, alpha: number = 1): string {
  let hexValue = hex.replace("#", "");
  if (hexValue.length === 3) {
    hexValue = hexValue
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const r = parseInt(hexValue.substring(0, 2), 16);
  const g = parseInt(hexValue.substring(2, 4), 16);
  const b = parseInt(hexValue.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(0, 0, 0, 1)`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function GlowingButton({
  children,
  className,
  glowColor = "#589BFF",
  onClick,
  disabled,
  type,
}: {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={
        {
          "--glow-color": hexToRgba(glowColor),
          "--glow-color-via": hexToRgba(glowColor, 0.075),
          "--glow-color-to": hexToRgba(glowColor, 0.2),
        } as React.CSSProperties
      }
      className={cn(
        "relative flex h-10 items-center justify-center overflow-hidden rounded-xl border border-r-0 bg-gradient-to-t !px-5 text-sm font-medium transition-colors duration-200",
        "border-white/60 from-white to-neutral-50 text-brand-dark hover:text-brand-dark/80",
        "z-20 after:absolute after:inset-0 after:rounded-[inherit] after:bg-gradient-to-r after:from-transparent after:from-40% after:via-[var(--glow-color-via)] after:via-70% after:to-[var(--glow-color-to)] after:shadow-[rgba(255,_255,_255,_0.15)_0px_1px_0px_inset]",
        "z-10 before:absolute before:right-0 before:h-[60%] before:w-[5px] before:rounded-l before:bg-[var(--glow-color)] before:shadow-[-2px_0_10px_var(--glow-color)] before:transition-all before:duration-200 hover:before:translate-x-full",
        className,
      )}
    >
      {children}
    </Button>
  );
}
