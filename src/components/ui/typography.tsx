import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function TypographyH1({ className, ...props }: ComponentProps<"h1">) {
  return <h1 className={cn("type-h1 scroll-m-20 text-balance", className)} {...props} />;
}

export function TypographyH2({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("type-h2 scroll-m-20 text-balance", className)} {...props} />;
}

export function TypographyH3({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("type-h3 scroll-m-20 text-balance", className)} {...props} />;
}

export function TypographyP({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("type-body", className)} {...props} />;
}

export function TypographyLead({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("type-lead", className)} {...props} />;
}

export function TypographyMuted({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("type-muted", className)} {...props} />;
}

export function TypographySmall({ className, ...props }: ComponentProps<"small">) {
  return <small className={cn("type-caption", className)} {...props} />;
}
