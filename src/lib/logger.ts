import * as Sentry from "@sentry/nextjs";

/**
 * Simple logger for observability
 */

type LogPayload = Record<string, unknown>;

export function logEvent(eventName: string, payload?: LogPayload) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[TELEMETRY] ${eventName}`, payload);
  }
  
  Sentry.captureMessage(`Telemetry: ${eventName}`, {
    level: "info",
    extra: payload,
    tags: {
      event_type: eventName
    }
  });
}
