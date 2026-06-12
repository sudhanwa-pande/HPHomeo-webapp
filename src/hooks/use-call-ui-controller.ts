import { useState, useCallback, useEffect, useMemo } from "react";

export type CallMode = "consultation" | "fullscreen" | "pip";
export type CallPanelState =
  | "none"
  | "prescription"
  | "patient"
  | "chat"
  | "info";

interface PanelByMode {
  consultation: CallPanelState;
  fullscreen: CallPanelState;
}

interface LastState {
  mode: CallMode;
  panel: CallPanelState;
}

export function useCallUIController(
  defaultMode: CallMode = "consultation",
  defaultPanel: CallPanelState = "prescription",
) {
  const [mode, setModeState] = useState<CallMode>(defaultMode);
  const [panelByMode, setPanelByMode] = useState<PanelByMode>({
    consultation: defaultPanel,
    fullscreen: "none",
  });
  const [lastState, setLastState] = useState<LastState | null>(null);

  // Derived active panel based on the current mode
  const activePanel =
    mode === "pip" ? "none" : panelByMode[mode as keyof PanelByMode] || "none";

  // Add body lock when not in PiP
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;

    if (mode !== "pip") {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "manipulation";
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [mode]);

  const setPanelForMode = useCallback(
    (panel: CallPanelState) => {
      setPanelByMode((prev) => {
        if (mode === "pip") return prev;
        return {
          ...prev,
          [mode]: panel,
        };
      });
    },
    [mode],
  );

  const togglePanel = useCallback(
    (panel: CallPanelState) => {
      setPanelByMode((prev) => {
        if (mode === "pip") return prev;
        const currentPanel = prev[mode as keyof PanelByMode];
        return {
          ...prev,
          [mode]: currentPanel === panel ? "none" : panel,
        };
      });
    },
    [mode],
  );

  const enterFullscreen = useCallback(() => {
    setModeState("fullscreen");
  }, []);

  const exitFullscreen = useCallback(() => {
    setModeState("consultation");
  }, []);

  const toggleFullscreen = useCallback(() => {
    setModeState((prev) =>
      prev === "fullscreen" ? "consultation" : "fullscreen",
    );
  }, []);

  const enterPiP = useCallback(() => {
    setLastState({ mode, panel: activePanel });
    setModeState("pip");
  }, [mode, activePanel]);

  const exitPiP = useCallback(() => {
    if (lastState) {
      setModeState(lastState.mode);
      setPanelByMode((prev) => ({
        ...prev,
        [lastState.mode]: lastState.panel,
      }));
    } else {
      setModeState("consultation");
      setPanelByMode((prev) => ({
        ...prev,
        consultation: defaultPanel,
      }));
    }
    setLastState(null);
  }, [lastState, defaultPanel]);

  return useMemo(
    () => ({
      mode,
      activePanel,
      setMode: setModeState,
      setPanel: setPanelForMode,
      togglePanel,
      enterFullscreen,
      exitFullscreen,
      toggleFullscreen,
      enterPiP,
      exitPiP,
    }),
    [
      mode,
      activePanel,
      setPanelForMode,
      togglePanel,
      enterFullscreen,
      exitFullscreen,
      toggleFullscreen,
      enterPiP,
      exitPiP,
    ],
  );
}
