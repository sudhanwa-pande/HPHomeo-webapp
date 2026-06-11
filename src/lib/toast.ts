"use client";

import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  description?: ReactNode | string;
  duration?: number | null;
  action?: ToastAction;
  id?: string;
}

function buildSonnerOptions(options?: ToastOptions, fallbackId?: string) {
  return {
    description: options?.description,
    duration: options?.duration === null ? Infinity : options?.duration,
    id: options?.id || fallbackId,
    action: options?.action
      ? {
          label: options.action.label,
          onClick: options.action.onClick,
        }
      : undefined,
  };
}

export const toast = {
  show(title: string, options?: ToastOptions) {
    return sonnerToast(title, buildSonnerOptions(options));
  },
  success(title: string, options?: ToastOptions) {
    return sonnerToast.success(title, buildSonnerOptions(options));
  },
  error(title: string, options?: ToastOptions) {
    // Enforce deduplication with composite key: ${title}-${description ?? "no-desc"}
    const fallbackId = `${title}-${options?.description || "no-desc"}`;
    return sonnerToast.error(title, buildSonnerOptions(options, fallbackId));
  },
  info(title: string, options?: ToastOptions) {
    return sonnerToast.info(title, buildSonnerOptions(options));
  },
  warning(title: string, options?: ToastOptions) {
    return sonnerToast.warning(title, buildSonnerOptions(options));
  },
  loading(title: string, options?: ToastOptions) {
    return sonnerToast.loading(title, buildSonnerOptions(options));
  },
  dismiss(id?: string) {
    sonnerToast.dismiss(id);
  },
  clear() {
    sonnerToast.dismiss();
  },
  promise<T>(
    promise: Promise<T> | (() => Promise<T>),
    labels: {
      loading: { title: string; description?: ReactNode | string };
      success:
        | { title: string; description?: ReactNode | string }
        | ((data: T) => { title: string; description?: ReactNode | string });
      error:
        | { title: string; description?: ReactNode | string }
        | ((error: unknown) => {
            title: string;
            description?: ReactNode | string;
          });
    },
  ) {
    const loadingMessage = labels.loading.title;

    return sonnerToast.promise(promise, {
      loading: loadingMessage,
      success: (data) => {
        const res =
          typeof labels.success === "function"
            ? labels.success(data)
            : labels.success;
        return res.title;
      },
      error: (err) => {
        const res =
          typeof labels.error === "function" ? labels.error(err) : labels.error;
        return res.title;
      },
    });
  },
};

export type { ToastOptions };
