"use client";

/**
 * Trigger a short haptic vibration on supported devices (Chrome Android, etc).
 * Falls back silently when the Vibration API is unavailable.
 *
 * @param pattern - vibration duration in ms, or an array of [vibrate, pause, vibrate, ...]
 */
export function hapticFeedback(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Vibration API may throw in restrictive contexts — ignore
  }
}

/** Light tap — for toggling, button presses */
export function hapticTap() {
  hapticFeedback(8);
}

/** Medium pulse — for important actions (finalize, call start/end) */
export function hapticPulse() {
  hapticFeedback(15);
}

/** Success pattern — double tap */
export function hapticSuccess() {
  hapticFeedback([10, 50, 10]);
}

/** Warning pattern — single strong */
export function hapticWarning() {
  hapticFeedback(30);
}
