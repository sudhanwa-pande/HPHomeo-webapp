import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { toast } from "@/lib/toast";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // send httpOnly cookies automatically
});

// Let axios set the correct multipart boundary when sending FormData
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

type ApiRequestConfig = AxiosRequestConfig & {
  _retried?: boolean;
  _skipAuthRefresh?: boolean;
};

const refreshPromises: Record<string, Promise<void>> = {};

function readRetryAfterSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.ceil(value);
  }

  if (typeof value !== "string") return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.ceil(numeric);
  }

  const retryDate = new Date(value);
  const retryMs = retryDate.getTime() - Date.now();
  if (Number.isFinite(retryMs) && retryMs > 0) {
    return Math.ceil(retryMs / 1000);
  }

  return null;
}

export function getRetryAfterSeconds(error: unknown): number | null {
  if (!axios.isAxiosError(error)) return null;
  const value = error.response?.headers?.["retry-after"];
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readRetryAfterSeconds(item);
      if (parsed) return parsed;
    }
    return null;
  }
  return readRetryAfterSeconds(value);
}

export function isRateLimitError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 429;
}

export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response && !axios.isCancel(error);
}

export function isSessionInvalidError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}

export function isRecoverableApiError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  const status = error.response.status;
  return status === 429 || status >= 500;
}

export function getRateLimitDescription(
  error: unknown,
  fallback = "Please wait a moment and try again.",
): string {
  const retryAfterSeconds = getRetryAfterSeconds(error);
  if (!retryAfterSeconds) return fallback;
  return retryAfterSeconds === 1
    ? "Please wait about 1 second and try again."
    : `Please wait about ${retryAfterSeconds} seconds and try again.`;
}

export function handleApiClientError(error: unknown) {
  if (!axios.isAxiosError(error)) return;

  // Aborted requests (e.g. React Query cancellation) are not real errors
  if (axios.isCancel(error)) return;

  if (!error.response) {
    toast.error("Connection lost", {
      description: "Check your internet connection and try again.",
    });
    return;
  }

  const { status } = error.response;

  if (status === 429) {
    toast.error("Too many requests", {
      description: getRateLimitDescription(error),
    });
  }

  if (status >= 500) {
    toast.error("Server unavailable", {
      description: "We couldn't complete that request right now. Please try again shortly.",
    });
  }
}

export function attachCommonErrorInterceptor(client: AxiosInstance) {
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      handleApiClientError(error);
      return Promise.reject(error);
    },
  );
}

/** Auth action endpoints that should never trigger a token refresh on 401.
 *  Session-checking endpoints like /auth/me are intentionally excluded
 *  so they CAN trigger a refresh (expired access token, valid refresh token). */
const SKIP_REFRESH_SUFFIXES = [
  "/login",
  "/register",
  "/refresh",
  "/request-otp",
  "/verify-otp",
  "/otp/verify",
  "/totp/validate",
  "/validate",
];

function shouldSkipAuthRefresh(config: ApiRequestConfig | undefined): boolean {
  if (!config) return false;
  if (config._skipAuthRefresh) return true;

  const url = config.url || "";
  return SKIP_REFRESH_SUFFIXES.some((suffix) => url.endsWith(suffix));
}

async function ensureSessionRefresh(refreshUrl: string): Promise<void> {
  if (!refreshPromises[refreshUrl]) {
    // Use the api instance (not raw axios) so the base URL and interceptors apply.
    refreshPromises[refreshUrl] = api
      .post(refreshUrl, {}, { _skipAuthRefresh: true } as ApiRequestConfig)
      .then(() => undefined)
      .finally(() => {
        delete refreshPromises[refreshUrl];
      });
  }

  return refreshPromises[refreshUrl];
}

// ---- Response interceptor: handle 401 + errors ----
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Silently reject cancelled requests (e.g. React Query abort)
    if (axios.isCancel(error)) return Promise.reject(error);

    if (!error.response) {
      handleApiClientError(error);
      return Promise.reject(error);
    }

    const { status } = error.response;
    const config = (error.config || {}) as ApiRequestConfig;
    const url = config.url || "";

    if (
      status === 401 &&
      !config._retried &&
      !shouldSkipAuthRefresh(config)
    ) {
      config._retried = true;

      // Determine which refresh endpoint to call based on the failing URL
      const isPatient = url.startsWith("/patient");
      const refreshUrl = isPatient ? "/patient/auth/refresh" : "/auth/refresh";

      try {
        await ensureSessionRefresh(refreshUrl);
        // Retry the original request (new cookies are set automatically)
        return api(config as AxiosRequestConfig);
      } catch (refreshError) {
        // Don't hard-redirect here — AuthGuard handles navigation cleanly.
        // Only show a toast for non-auth errors (network/server failures).
        if (!isSessionInvalidError(refreshError)) {
          handleApiClientError(refreshError);
        }
        return Promise.reject(refreshError);
      }
    }

    handleApiClientError(error);
    return Promise.reject(error);
  },
);

export default api;

// Helper to extract a user-safe error message from API responses.
// Raw backend details (stack traces, internal messages) are never exposed.
// Allow common prose characters but block patterns that signal internal errors
// (file paths, stack traces, SQL keywords, angle-bracket markup).
const UNSAFE_ERROR_PATTERN = /[<>]|\\n|Traceback|File\s+"|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\s+FROM\b/i;

export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.data) {
    const data = error.response.data;

    // Handle dict detail e.g. { detail: { message: "otp_recently_sent", retry_after_seconds: 60 } }
    if (data.detail && typeof data.detail === "object" && typeof data.detail.message === "string") {
      const msg = data.detail.message as string;
      const retryAfter = typeof data.detail.retry_after_seconds === "number"
        ? data.detail.retry_after_seconds
        : null;
      const full = retryAfter ? `${msg}. Please try again in ${retryAfter}s.` : msg;
      if (full.length <= 300 && !UNSAFE_ERROR_PATTERN.test(full)) {
        return full;
      }
    }

    const raw = typeof data.detail === "string"
      ? data.detail
      : typeof data.message === "string"
        ? data.message
        : null;

    // Only surface the backend message if it looks like a user-facing string
    // (no file paths, no stack traces, no SQL, bounded length).
    if (raw && raw.length <= 300 && !UNSAFE_ERROR_PATTERN.test(raw)) {
      return raw;
    }
  }
  return "An unexpected error occurred.";
}
