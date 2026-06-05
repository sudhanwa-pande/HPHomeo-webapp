import * as Sentry from "@sentry/nextjs";

/**
 * Simple logger for observability
 */

type LogPayload = Record<string, unknown>;

export function logEvent(eventName: string, payload?: LogPayload) {
  const timestamp = new Date().toISOString();
  console.log(`[TELEMETRY][${timestamp}] ${eventName}`, JSON.stringify(payload || {}));
  
  Sentry.captureMessage(`Telemetry: ${eventName}`, {
    level: "info",
    extra: payload,
    tags: {
      event_type: eventName
    }
  });
}
