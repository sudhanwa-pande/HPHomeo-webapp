"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const el = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setValue(e.matches);
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, [query]);

  return value;
}
