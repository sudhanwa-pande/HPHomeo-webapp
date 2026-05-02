"use client";

import { getApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

function resolveDescription(title: string, description?: string) {
  const value = description?.trim();
  if (!value || value === title) return undefined;
  return value;
}

export function notifySuccess(title: string, description?: string) {
  return toast.success(title, {
    description: resolveDescription(title, description),
  });
}

export function notifyError(title: string, description?: string) {
  return toast.error(title, {
    description: resolveDescription(title, description),
  });
}

export function notifyInfo(title: string, description?: string) {
  return toast.info(title, {
    description: resolveDescription(title, description),
  });
}

export function notifyWarning(title: string, description?: string) {
  return toast.warning(title, {
    description: resolveDescription(title, description),
  });
}

export function notifyApiError(
  error: unknown,
  title = "Couldn't complete that action",
  description?: string,
) {
  return notifyError(title, getApiError(error) || description);
}
