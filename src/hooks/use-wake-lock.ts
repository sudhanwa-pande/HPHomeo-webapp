"use client";

import { useEffect, useRef } from "react";

/**
 * useWakeLock
 *
 * Prevents the device screen from sleeping during a call.
 * Essential for mobile devices where the user might just be listening.
 */
export function useWakeLock(enabled = true) {
  const isSupported = typeof window !== "undefined" && "wakeLock" in navigator;
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    if (!isSupported) return;

    const requestWakeLock = async () => {
      try {
        if (!wakeLockRef.current) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
          console.log("Wake Lock acquired");
        }
      } catch (err) {
        console.warn("Wake Lock error:", err);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log("Wake Lock released");
        } catch (err) {
          console.error("Wake Lock release error:", err);
        }
      }
    };

    if (enabled) {
      // Request wake lock initially
      requestWakeLock();

      // Re-request wake lock when visibility changes (if app comes back from background)
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          requestWakeLock();
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        releaseWakeLock();
      };
    } else {
      releaseWakeLock();
    }
  }, [isSupported, enabled]);

  return { isSupported };
}
