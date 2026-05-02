import { useState, useEffect, useCallback } from "react";

interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isExpired: boolean;
  label: string;
}

function calcRemaining(targetMs: number): CountdownResult {
  const diff = Math.max(0, targetMs - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let label = "";
  if (diff <= 0) {
    label = "Now";
  } else if (days > 0) {
    label = `${days}d ${hours}h`;
  } else if (hours > 0) {
    label = `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    label = `${minutes}m ${seconds}s`;
  } else {
    label = `${seconds}s`;
  }

  return { days, hours, minutes, seconds, totalSeconds, isExpired: diff <= 0, label };
}

const EXPIRED: CountdownResult = { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isExpired: true, label: "" };

export function useCountdown(targetDate: string | null | undefined): CountdownResult {
  const targetMs = targetDate ? new Date(targetDate).getTime() : 0;

  // Static initial value — avoids SSR/client Date.now() mismatch in useState initializer
  const [state, setState] = useState<CountdownResult>(EXPIRED);

  const tick = useCallback(() => {
    if (!targetDate) return;
    setState(calcRemaining(targetMs));
  }, [targetDate, targetMs]);

  useEffect(() => {
    if (!targetDate) return;
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDate, tick]);

  return state;
}
