"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import api from "@/lib/api";

/**
 * SSE event as received from the backend event bus.
 */
export interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
  ts: string;
}

type EventHandler = (event: SSEEvent) => void;

export type SSEConnectionState = "connecting" | "connected" | "disconnected";

interface UseEventStreamOptions {
  /** SSE endpoint path, e.g. "/doctor/events/stream" */
  path: string;
  /** Map of event type → handler */
  onEvent: Record<string, EventHandler>;
  /** Whether the stream is active (default: true) */
  enabled?: boolean;
  /** Called on any event regardless of type */
  onAnyEvent?: EventHandler;
  /** Called when the connection is re-established after a drop (not on initial connect) */
  onReconnect?: () => void;
}

interface UseEventStreamReturn {
  /** Current connection state */
  connectionState: SSEConnectionState;
  /** True after the first successful connection (distinguishes "not yet connected" from "lost") */
  hasConnected: boolean;
}

/** Stop retrying after this many consecutive failures (~5 min of attempts).
 *  The counter resets when the tab becomes visible or a connection succeeds. */
const MAX_RETRIES = 20;

/**
 * React hook that opens an SSE connection to the backend and dispatches
 * events to the provided handlers.
 *
 * Features:
 * - Event types are derived dynamically from `onEvent` keys — no hardcoded list
 * - Auto-reconnects with exponential backoff on error (1s → 30s max, up to MAX_RETRIES)
 * - Pauses when the tab is hidden, resumes when visible (prevents phantom connections)
 * - Handles _auth_expired events from the proxy by refreshing cookies before reconnecting
 * - Fires onReconnect callback on reconnection so consumers can force a refetch
 * - Deduplicates connections — only one EventSource per hook instance at a time
 * - Cleans up on unmount or when `enabled` becomes false
 * - Uses `withCredentials` so httpOnly auth cookies are sent
 * - Exposes `connectionState` so components can show live/offline indicators
 * - Does NOT replace React Query cache — handlers should call queryClient.invalidateQueries()
 *   or update local state to trigger UI refreshes.
 */
export function useEventStream({
  path,
  onEvent,
  enabled = true,
  onAnyEvent,
  onReconnect,
}: UseEventStreamOptions): UseEventStreamReturn {
  const [connectionState, setConnectionState] =
    useState<SSEConnectionState>("disconnected");

  // Keep handlers in a ref so reconnections always use latest handlers
  // without re-triggering the effect.
  const handlersRef = useRef(onEvent);
  handlersRef.current = onEvent;

  const onAnyRef = useRef(onAnyEvent);
  onAnyRef.current = onAnyEvent;

  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the active EventSource so the cleanup function can close
  // whichever instance is live (including one created by a retry timer).
  const esRef = useRef<EventSource | null>(null);
  // Guard against double-connect (React strict mode, fast re-renders)
  const connectingRef = useRef(false);
  // True after the first successful connection in this hook's lifetime.
  // Used to distinguish initial connect from reconnection.
  const hasConnectedRef = useRef(false);
  // Mirrors hasConnectedRef as React state so consumers can react to it.
  const [hasConnected, setHasConnected] = useState(false);
  // True while a cookie refresh is in progress (prevents overlapping refreshes)
  const refreshingRef = useRef(false);
  // Set to false on cleanup — guards against zombie connections from async
  // operations (auth refresh) that resolve after the hook has unmounted.
  const mountedRef = useRef(true);

  const disconnect = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    connectingRef.current = false;
    setConnectionState("disconnected");
  }, []);

  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (esRef.current || connectingRef.current) return;
    connectingRef.current = true;
    setConnectionState("connecting");

    // SSE streams go through /api/sse/ — a dedicated streaming proxy route.
    // The normal Next.js rewrite (/api/v1/) buffers responses, which breaks SSE.
    const url = `/api/sse${path}`;

    let es: EventSource;
    try {
      es = new EventSource(url, { withCredentials: true });
    } catch {
      connectingRef.current = false;
      setConnectionState("disconnected");
      return;
    }
    esRef.current = es;
    connectingRef.current = false;

    es.onopen = () => {
      const wasReconnect = hasConnectedRef.current;
      hasConnectedRef.current = true;
      setHasConnected(true);
      retryCountRef.current = 0; // reset backoff on successful connect
      setConnectionState("connected");

      // On reconnection, fire the callback so consumers can force a refetch
      // to pick up events missed during the disconnection window.
      if (wasReconnect) {
        onReconnectRef.current?.();
      }
    };

    // If the backend returns 401 (expired auth cookie), the proxy converts
    // it to an _auth_expired SSE event. Refresh cookies via axios (which
    // handles the httpOnly cookie rotation) then reconnect.
    es.addEventListener("_auth_expired", () => {
      es.close();
      esRef.current = null;
      setConnectionState("disconnected");

      if (refreshingRef.current) return; // already refreshing
      refreshingRef.current = true;

      // Determine refresh endpoint from the SSE path
      const isPatient = path.startsWith("/patient");
      const refreshUrl = isPatient ? "/patient/auth/refresh" : "/auth/refresh";

      if (process.env.NODE_ENV === "development") {
        console.debug(`[SSE] auth expired on ${path}, refreshing via ${refreshUrl}`);
      }

      api
        .post(refreshUrl, {}, { _skipAuthRefresh: true } as never)
        .then(() => {
          if (!mountedRef.current) return; // component unmounted during refresh
          retryCountRef.current = 0;
          connect();
        })
        .catch(() => {
          if (!mountedRef.current) return;
          // Refresh failed — session is truly expired. Stay disconnected;
          // AuthGuard will redirect to login on the next REST call.
          setConnectionState("disconnected");
        })
        .finally(() => {
          refreshingRef.current = false;
        });
    });

    // If the backend returns 429 (too many connections for this user),
    // the proxy converts it to a _rate_limited SSE event. Back off hard.
    es.addEventListener("_rate_limited", () => {
      es.close();
      esRef.current = null;
      setConnectionState("disconnected");
      retryCountRef.current = 6; // jump to ~60s backoff
      const delay = 60_000;
      if (process.env.NODE_ENV === "development") {
        console.debug(
          `[SSE] rate-limited on ${path}, backing off ${delay}ms`,
        );
      }
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        connect();
      }, delay);
    });

    // Dynamically register listeners for every event type the caller handles.
    const eventTypes = Object.keys(handlersRef.current);

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const parsed: SSEEvent = JSON.parse(e.data);
          handlersRef.current[eventType]?.(parsed);
          onAnyRef.current?.(parsed);
        } catch {
          // Ignore malformed events
        }
      });
    }

    es.onerror = () => {
      // Close the failed connection — this also detaches its listeners
      // since the entire EventSource instance is discarded.
      es.close();
      esRef.current = null;
      setConnectionState("disconnected");

      // Don't reconnect if the tab is hidden — the visibility handler will
      // reconnect when the user returns.
      if (typeof document !== "undefined" && document.hidden) return;

      // Stop retrying after MAX_RETRIES consecutive failures to avoid
      // hammering a down server indefinitely. The counter resets when
      // the tab becomes visible again or a connection succeeds.
      if (retryCountRef.current >= MAX_RETRIES) {
        if (process.env.NODE_ENV === "development") {
          console.debug(
            `[SSE] max retries (${MAX_RETRIES}) reached on ${path}, giving up until tab visibility changes`,
          );
        }
        setConnectionState("disconnected");
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(1000 * 2 ** retryCountRef.current, 30_000);
      retryCountRef.current++;

      if (process.env.NODE_ENV === "development") {
        console.debug(
          `[SSE] connection error on ${path}, retrying in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`,
        );
      }

      setConnectionState("connecting");

      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        connect();
      }, delay);
    };

    return es;
  }, [path]);

  useEffect(() => {
    if (!enabled) return;

    connect();

    // Pause SSE when the tab is hidden to prevent phantom connections
    // that hold Redis pubsub slots while the user isn't looking.
    function handleVisibilityChange() {
      if (document.hidden) {
        disconnect();
      } else {
        // Reset retry counter when the user returns — if the server was
        // temporarily down, this gives it a fresh set of attempts.
        retryCountRef.current = 0;
        // Small delay to avoid rapid connect/disconnect on fast tab switches
        setTimeout(() => {
          if (!document.hidden && mountedRef.current) connect();
        }, 500);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return { connectionState, hasConnected };
}
