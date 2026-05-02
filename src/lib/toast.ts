"use client";

import type { ReactNode } from "react";
import { sileo } from "sileo";

type ToastVariant = "default" | "success" | "error" | "info" | "warning" | "loading";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  description?: ReactNode | string;
  duration?: number | null;
  action?: ToastAction;
}

function buildToastOptions(
  variant: ToastVariant,
  title: string,
  options?: ToastOptions,
) {
  return {
    title,
    type: variant === "default" ? "info" : variant,
    description: options?.description,
    duration: options?.duration,
    fill: "#ffffff",
    roundness: 20,
    autopilot: { expand: 120, collapse: 3800 },
    styles: {
      title: "sileo-modern-title",
      description: "sileo-modern-description",
      badge: "sileo-modern-badge",
      button: "sileo-modern-button",
    },
    button: options?.action
      ? {
          title: options.action.label,
          onClick: options.action.onClick,
        }
      : undefined,
  } as const;
}

export const toast = {
  show(title: string, options?: ToastOptions) {
    return sileo.show(buildToastOptions("default", title, options));
  },
  success(title: string, options?: ToastOptions) {
    return sileo.success(buildToastOptions("success", title, options));
  },
  error(title: string, options?: ToastOptions) {
    return sileo.error(buildToastOptions("error", title, options));
  },
  info(title: string, options?: ToastOptions) {
    return sileo.info(buildToastOptions("info", title, options));
  },
  warning(title: string, options?: ToastOptions) {
    return sileo.warning(buildToastOptions("warning", title, options));
  },
  loading(title: string, options?: ToastOptions) {
    return sileo.show(buildToastOptions("loading", title, { ...options, duration: null }));
  },
  dismiss(id: string) {
    sileo.dismiss(id);
  },
  clear() {
    sileo.clear();
  },
  promise<T>(
    promise: Promise<T> | (() => Promise<T>),
    labels: {
      loading: { title: string; description?: ReactNode | string };
      success: { title: string; description?: ReactNode | string } | ((data: T) => { title: string; description?: ReactNode | string });
      error: { title: string; description?: ReactNode | string } | ((error: unknown) => { title: string; description?: ReactNode | string });
    },
  ) {
    const successOptions =
      typeof labels.success === "function"
        ? (data: T) => {
            const result = (labels.success as (data: T) => { title: string; description?: ReactNode | string })(data);
            return buildToastOptions("success", result.title, {
              description: result.description,
            });
          }
        : buildToastOptions("success", labels.success.title, {
            description: labels.success.description,
          });

    const errorOptions =
      typeof labels.error === "function"
        ? (error: unknown) => {
            const result = (labels.error as (error: unknown) => { title: string; description?: ReactNode | string })(error);
            return buildToastOptions("error", result.title, {
              description: result.description,
            });
          }
        : buildToastOptions("error", labels.error.title, {
            description: labels.error.description,
          });

    return sileo.promise(promise, {
      loading: buildToastOptions("loading", labels.loading.title, {
        description: labels.loading.description,
        duration: null,
      }),
      success: successOptions,
      error: errorOptions,
    });
  },
};

export type { ToastOptions };
