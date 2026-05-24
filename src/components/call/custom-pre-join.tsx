"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { Camera, CameraOff, Mic, MicOff, Video } from "lucide-react";
import { usePreviewTracks, type LocalUserChoices } from "@livekit/components-react";
import type { LocalVideoTrack } from "livekit-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/haptics";

interface CustomPreJoinProps {
  onSubmit: (values: LocalUserChoices) => void;
  patientName?: string;
}

export function CustomPreJoin({ onSubmit, patientName = "Guest" }: CustomPreJoinProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Let LiveKit handle the hardware track lifecycle
  const tracks = usePreviewTracks(
    {
      audio: audioEnabled,
      video: videoEnabled,
    },
    (err) => {
      console.error("Failed to acquire tracks via LiveKit", err);
      if (err.message.includes("video")) setVideoEnabled(false);
    }
  );

  const videoTrack = useMemo(
    () => tracks?.find((t) => t.kind === "video") as LocalVideoTrack | undefined,
    [tracks]
  );

  // Attach the LiveKit track to our custom video element
  useEffect(() => {
    if (videoTrack && videoRef.current) {
      videoTrack.attach(videoRef.current);
      return () => {
        if (videoRef.current) videoTrack.detach(videoRef.current);
      };
    }
  }, [videoTrack]);

  const handleSubmit = () => {
    hapticTap();
    // No need to manually stop tracks here; LiveKit's usePreviewTracks hook
    // will properly stop and cleanup the hardware tracks when this component unmounts!
    onSubmit({
      videoEnabled,
      audioEnabled,
      videoDeviceId: "",
      audioDeviceId: "",
      username: patientName,
    });
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-4 sm:p-6 sm:px-12 bg-[#060B14]">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-8 items-center h-full sm:h-auto">
        {/* Left side: Video Preview */}
        <div className="md:col-span-8 flex flex-col h-full sm:h-auto justify-center relative">
          <div className="relative aspect-[3/4] sm:aspect-video w-full overflow-hidden rounded-[2rem] bg-[#111113] border border-white/5 shadow-[0_32px_64px_rgba(0,0,0,0.4)]">
            {videoEnabled && videoTrack ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center space-y-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
                  <CameraOff className="h-8 w-8 text-white/30" />
                </div>
                <p className="text-sm font-medium text-white/40">Camera is off</p>
              </div>
            )}

            {/* Floating Badge */}
            <div className="absolute bottom-6 left-6 rounded-full bg-black/40 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur-md border border-white/10 shadow-xl">
              {patientName} (You)
            </div>
            
            {/* Embedded Mobile Toggles (hidden on md screens) */}
            <div className="absolute bottom-6 right-6 flex gap-3 md:hidden">
              <button
                type="button"
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-95 shadow-xl border",
                  audioEnabled 
                    ? "bg-white/20 text-white hover:bg-white/30 border-white/10" 
                    : "bg-red-500/90 text-white hover:bg-red-500 border-red-500/50"
                )}
              >
                {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={() => setVideoEnabled(!videoEnabled)}
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-95 shadow-xl border",
                  videoEnabled 
                    ? "bg-white/20 text-white hover:bg-white/30 border-white/10" 
                    : "bg-red-500/90 text-white hover:bg-red-500 border-red-500/50"
                )}
              >
                {videoEnabled ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right side: Controls & Join (Desktop visible mostly, stacked on mobile) */}
        <div className="md:col-span-4 flex w-full flex-col space-y-6 pb-8 md:pb-0 z-10">
          <div className="space-y-2 text-center md:text-left">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Ready to join?</h1>
            <p className="text-sm text-white/50">Configure your devices before entering the consultation.</p>
          </div>

          <div className="hidden md:flex flex-col gap-3 rounded-[1.5rem] bg-white/[0.03] p-5 border border-white-[0.08] shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white/80">Microphone</span>
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={cn(
                  "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                  audioEnabled ? "bg-brand" : "bg-white/20"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    audioEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
            <div className="h-px w-full bg-white/5 my-1" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white/80">Camera</span>
              <button
                onClick={() => setVideoEnabled(!videoEnabled)}
                className={cn(
                  "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                  videoEnabled ? "bg-brand" : "bg-white/20"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    videoEnabled ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full h-14 rounded-[1.2rem] bg-brand text-base font-bold text-white shadow-[0_8px_32px_rgba(88,155,255,0.3)] hover:bg-brand/90 hover:shadow-[0_12px_40px_rgba(88,155,255,0.4)] transition-all active:scale-[0.98]"
            onClick={handleSubmit}
          >
            <Video className="mr-2 h-5 w-5" />
            Join Consultation
          </Button>
        </div>
      </div>
    </div>
  );
}
