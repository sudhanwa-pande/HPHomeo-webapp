import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CallMode, CallPanelState } from "@/hooks/use-call-ui-controller";

const VIDEO_SPLIT = {
  mobile: 0.4,
};

interface CallLayoutProps {
  mode: CallMode;
  panel: CallPanelState;
  video: ReactNode;
  panels: ReactNode;
  controls: ReactNode;
  isMobileViewport: boolean;
}

export const CallLayout = React.memo(function CallLayout({
  mode,
  panel,
  video,
  panels,
  controls,
  isMobileViewport,
}: CallLayoutProps) {
  const showPanel = panel !== "none" && mode !== "pip";

  const isFullscreen = mode === "fullscreen";

  return (
    <div
      className={cn(
        "relative flex overflow-hidden bg-black transition-all duration-300",
        isMobileViewport ? "flex-col" : "flex-row",
        isFullscreen
          ? "fixed inset-0 z-[100] w-full" // Fullscreen overlay
          : "w-full h-full rounded-2xl border border-border/60", // Container constrained
      )}
      style={{
        ...(isFullscreen
          ? { height: "100dvh", paddingBottom: "env(safe-area-inset-bottom)" }
          : { height: "100%" }),
      }}
    >
      {/* VIDEO CONTAINER */}
      <div
        className={cn(
          "video-container relative flex-shrink-0 transition-all duration-300 ease-out z-[10]",
          !showPanel ? "flex-1" : "",
        )}
        style={{
          contain: "layout size style",
          willChange: "transform",
          // On mobile, video uses the split ratio when panel is open.
          // On desktop, video just flexes to fill the remaining space.
          ...(isMobileViewport && showPanel
            ? { height: `${VIDEO_SPLIT.mobile * 100}dvh`, width: "100vw" }
            : !isMobileViewport && showPanel
              ? { height: "100%", flex: 1 }
              : { height: "100%", width: "100%" }),
        }}
      >
        {video}

        {/* Controls Overlay (Bottom bar, top bar) */}
        <div className="absolute inset-0 pointer-events-none z-[30]">
          {controls}
        </div>
      </div>

      {/* PANELS CONTAINER */}
      <div
        className={cn(
          "panel transition-all duration-300 ease-out bg-panel border-call-border z-[20] flex flex-col min-h-0",
          isMobileViewport
            ? "w-full border-t"
            : "h-full border-l w-[420px] md:w-[480px] lg:w-[520px] shrink-0",
          !showPanel
            ? isMobileViewport
              ? "translate-y-full opacity-0 absolute bottom-0 h-0"
              : "translate-x-full opacity-0 absolute right-0 w-0"
            : isMobileViewport
              ? "translate-y-0 opacity-100 flex-1 relative"
              : "translate-x-0 opacity-100 relative",
        )}
        style={{
          willChange: "transform, opacity",
          backfaceVisibility: "hidden",
        }}
      >
        <div className="relative w-full h-full flex flex-col min-h-0 bg-panel">
          {panels}
        </div>
      </div>
    </div>
  );
});
