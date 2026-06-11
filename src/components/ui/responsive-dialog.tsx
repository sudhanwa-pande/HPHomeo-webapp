"use client";

import * as React from "react";
import { Drawer } from "vaul";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DialogSize = "sm" | "md" | "lg" | "xl" | "full";

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
  maxClassName?: string;
  contentClassName?: string;
  isDirty?: boolean;
}

const sizeMap: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-2rem)] 2xl:max-w-[1400px]",
};

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "lg",
  maxClassName,
  contentClassName,
  isDirty = false,
}: ResponsiveDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const hasPushedRef = React.useRef(false);

  const handleCloseRequest = React.useCallback(() => {
    if (isDirty) {
      const confirmClose = window.confirm(
        "You have unsaved changes. Are you sure you want to discard them?",
      );
      if (!confirmClose) {
        // Restore history state
        if (open && !hasPushedRef.current) {
          window.history.pushState({ dialogOpen: true }, "");
          hasPushedRef.current = true;
        }
        return;
      }
    }
    onOpenChange(false);
  }, [isDirty, open, onOpenChange]);

  // Handle browser/mobile physical back button
  React.useEffect(() => {
    if (!open) {
      hasPushedRef.current = false;
      return;
    }

    const handlePopState = () => {
      hasPushedRef.current = false;
      handleCloseRequest();
    };

    if (!hasPushedRef.current) {
      window.history.pushState({ dialogOpen: true }, "");
      hasPushedRef.current = true;
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (hasPushedRef.current) {
        if (window.history.state?.dialogOpen) {
          window.history.back();
        }
        hasPushedRef.current = false;
      }
    };
  }, [open, handleCloseRequest]);

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "rounded-[1.8rem] p-0 overflow-hidden transition-all duration-200 ease-out",
            maxClassName || sizeMap[size],
          )}
          onPointerDownOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              const confirmClose = window.confirm(
                "You have unsaved changes. Are you sure you want to discard them?",
              );
              if (confirmClose) {
                onOpenChange(false);
              }
            }
          }}
          onEscapeKeyDown={(e) => {
            if (isDirty) {
              e.preventDefault();
              const confirmClose = window.confirm(
                "You have unsaved changes. Are you sure you want to discard them?",
              );
              if (confirmClose) {
                onOpenChange(false);
              }
            }
          }}
        >
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
          <div className={cn("px-6 py-4", contentClassName)}>{children}</div>
          {footer && (
            <DialogFooter className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              {footer}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  const isFullHeight = size === "full";

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          handleCloseRequest();
        } else {
          onOpenChange(val);
        }
      }}
      dismissible={!isDirty}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] transition-opacity duration-200 ease-out" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white border-slate-100 shadow-[0_-8px_40px_rgba(0,0,0,0.15)] focus:outline-none transition-transform duration-200 ease-out",
            isFullHeight
              ? "inset-0 h-screen max-h-screen rounded-t-none"
              : "rounded-t-[2rem] border-t max-h-[92vh]",
          )}
        >
          {/* Drag Handle (only if not full height) */}
          {!isFullHeight && (
            <div className="mx-auto my-3 h-1.5 w-12 shrink-0 rounded-full bg-slate-200" />
          )}

          {/* Header */}
          <div
            className={cn(
              "px-6",
              isFullHeight
                ? "pt-[calc(1.5rem+env(safe-area-inset-top))] pb-3 border-b border-slate-100"
                : "pt-2 pb-2",
            )}
          >
            <Drawer.Title className="text-lg font-bold text-slate-900">
              {title}
            </Drawer.Title>
            {description && (
              <Drawer.Description className="text-xs text-slate-500 mt-1">
                {description}
              </Drawer.Description>
            )}
          </div>

          {/* Body */}
          <div
            className={cn(
              "flex-1 overflow-y-auto px-6 py-4 text-sm text-slate-700",
              contentClassName,
            )}
          >
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div
              className={cn(
                "sticky bottom-0 border-t border-slate-100 p-6 flex flex-col gap-2 bg-slate-50/50 z-10",
                isFullHeight
                  ? "pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
                  : "rounded-b-[2rem] pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
              )}
            >
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
