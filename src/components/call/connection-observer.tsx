"use client";

import { useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { Loader2 } from "lucide-react";

export function ConnectionObserver() {
  const state = useConnectionState();

  if (state === ConnectionState.Reconnecting) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
        <div className="flex flex-col items-center gap-4 text-center p-6 rounded-2xl bg-black/40 border border-white/10 shadow-2xl">
          <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
          <div>
            <p className="text-white font-bold text-lg">Connection unstable</p>
            <p className="text-white/70 text-sm mt-1">Attempting to reconnect...</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
