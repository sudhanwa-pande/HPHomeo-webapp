"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PiPMode = "normal" | "keyboard" | "peeking" | "dragging";

export type Viewport = {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
};

export function usePiPEngine(minimized: boolean) {
  const [mode, setMode] = useState<PiPMode>("normal");
  const [viewport, setViewport] = useState<Viewport>({
    width: 0,
    height: 0,
    offsetTop: 0,
    offsetLeft: 0,
  });

  const rafRef = useRef<number | null>(null);
  const peekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxHeightRef = useRef(0);

  /* ── Viewport tracking (RAF synchronized) ── */
  const updateViewport = useCallback(() => {
    const vv = window.visualViewport;

    const width = vv?.width ?? window.innerWidth;
    const height = vv?.height ?? window.innerHeight;
    const offsetTop = vv?.offsetTop ?? 0;
    const offsetLeft = vv?.offsetLeft ?? 0;

    if (height > maxHeightRef.current) {
      maxHeightRef.current = height;
    }

    const keyboardOpen = maxHeightRef.current - height > 150;

    setViewport({ width, height, offsetTop, offsetLeft });

    setMode((prev) => {
      if (prev === "dragging") return prev;
      return keyboardOpen ? "keyboard" : "normal";
    });
  }, []);

  useEffect(() => {
    if (!minimized || typeof window === "undefined") return;

    const handler = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateViewport);
    };

    const vv = window.visualViewport;

    vv?.addEventListener("resize", handler);
    vv?.addEventListener("scroll", handler);

    handler();

    return () => {
      vv?.removeEventListener("resize", handler);
      vv?.removeEventListener("scroll", handler);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [minimized, updateViewport]);

  /* ── Derived Layout (NO setState races) ── */
  const pipWidth = mode === "peeking" ? 200 : mode === "keyboard" ? 160 : 180;
  const pipHeight = pipWidth * (4 / 3); // enforce 1.33 ratio

  const dragConstraints = useMemo(() => {
    const margin = 16;

    return {
      top: viewport.offsetTop + (mode === "keyboard" ? 16 : 48),
      left: viewport.offsetLeft + margin,
      right: Math.max(
        0,
        viewport.offsetLeft + viewport.width - pipWidth - margin,
      ),
      bottom: Math.max(
        0,
        viewport.offsetTop + viewport.height - pipHeight - margin,
      ),
    };
  }, [viewport, pipWidth, pipHeight, mode]);

  /* ── Interaction ── */
  const onDragStart = () => {
    setMode("dragging");
  };

  const onDragEnd = () => {
    setMode("normal");
  };

  const peek = () => {
    setMode((prev) => {
      if (prev === "dragging") return prev;
      return "peeking";
    });

    if (peekTimeoutRef.current) {
      clearTimeout(peekTimeoutRef.current);
    }

    peekTimeoutRef.current = setTimeout(() => {
      setMode((prev) => (prev === "peeking" ? "keyboard" : prev));
    }, 2400);
  };

  return {
    pipWidth,
    pipHeight,
    dragConstraints,
    mode,
    onDragStart,
    onDragEnd,
    peek,
  };
}
