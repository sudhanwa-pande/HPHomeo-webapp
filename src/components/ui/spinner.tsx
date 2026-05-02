"use client";

import { cn } from "@/lib/utils";

export function Spinner({
  className,
  size = "default",
}: {
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        size === "sm" && "h-3.5 w-3.5",
        size === "default" && "h-4 w-4",
        size === "lg" && "h-6 w-6",
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
