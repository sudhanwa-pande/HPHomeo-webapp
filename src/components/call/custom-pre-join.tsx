"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff } from "lucide-react";
import type { LocalUserChoices } from "@livekit/components-react";
import { createLocalVideoTrack, createLocalAudioTrack, LocalVideoTrack, LocalAudioTrack } from "livekit-client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/haptics";
import { logEvent } from "@/lib/logger";

interface CustomPreJoinProps {
  onSubmit: (
    values: LocalUserChoices,
    localTracks?: { videoTrack?: LocalVideoTrack; audioTrack?: LocalAudioTrack }
  ) => void;
  userName?: string;
  isJoining?: boolean;
  otherPartyWaiting?: boolean;
}

export function CustomPreJoin({
  onSubmit,
  userName = "Guest",
  isJoining = false,
  otherPartyWaiting = false,
}: CustomPreJoinProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<LocalAudioTrack | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>("");
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");

  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const hasSubmittedRef = useRef(false);

  // Fetch device list
  useEffect(() => {
    async function getDevices() {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        setDevices(devs);
      } catch (e) {
        console.warn("Failed to enumerate devices", e);
      }
    }
    getDevices();
    navigator.mediaDevices.addEventListener("devicechange", getDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", getDevices);
  }, []);

  // Video track lifecycle
  useEffect(() => {
    let active = true;
    let createdTrack: LocalVideoTrack | null = null;

    async function updateVideoTrack() {
      if (!videoEnabled) {
        if (videoTrackRef.current) {
          videoTrackRef.current.stop();
          videoTrackRef.current = null;
        }
        setLocalVideoTrack(null);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        if (videoTrackRef.current) {
          const settings = videoTrackRef.current.mediaStreamTrack.getSettings();
          const matchesDevice = selectedVideoDevice
            ? (settings.deviceId === selectedVideoDevice || (!settings.deviceId && settings.facingMode === "user"))
            : true;

          if (videoTrackRef.current.mediaStreamTrack.readyState === "live" && matchesDevice) {
            setIsLoading(false);
            return;
          }
          videoTrackRef.current.stop();
        }

        createdTrack = await createLocalVideoTrack({
          deviceId: selectedVideoDevice || undefined,
        });

        if (active) {
          videoTrackRef.current = createdTrack;
          setLocalVideoTrack(createdTrack);
          
          const actualDeviceId = createdTrack.mediaStreamTrack.getSettings().deviceId;
          if (actualDeviceId && actualDeviceId !== selectedVideoDevice) {
            setSelectedVideoDevice(actualDeviceId);
          }
          
          logEvent("PREVIEW_READY", { type: "video", deviceId: actualDeviceId });
        } else {
          createdTrack.stop();
        }
      } catch (err: any) {
        if (active) {
          logEvent("prejoin_media_error", { type: "video", error: String(err) });
          if (err?.name === "NotReadableError") {
            setError("Camera is in use by another application. Please close other apps using the camera.");
          } else if (err?.name === "NotAllowedError") {
            setError("Camera access permission was denied.");
          } else {
            setError("Failed to access camera.");
          }
          setVideoEnabled(false);
          setLocalVideoTrack(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    updateVideoTrack();
    return () => {
      active = false;
      if (createdTrack && !hasSubmittedRef.current) {
        createdTrack.stop();
      }
    };
  }, [videoEnabled, selectedVideoDevice]);

  // Audio track lifecycle
  useEffect(() => {
    let active = true;
    let createdTrack: LocalAudioTrack | null = null;

    async function updateAudioTrack() {
      if (!audioEnabled) {
        if (audioTrackRef.current) {
          audioTrackRef.current.stop();
          audioTrackRef.current = null;
        }
        setLocalAudioTrack(null);
        return;
      }

      try {
        if (audioTrackRef.current) {
          const settings = audioTrackRef.current.mediaStreamTrack.getSettings();
          const matchesDevice = selectedAudioDevice
            ? (settings.deviceId === selectedAudioDevice)
            : true;

          if (audioTrackRef.current.mediaStreamTrack.readyState === "live" && matchesDevice) {
            return;
          }
          audioTrackRef.current.stop();
        }

        createdTrack = await createLocalAudioTrack({
          deviceId: selectedAudioDevice || undefined,
        });

        if (active) {
          audioTrackRef.current = createdTrack;
          setLocalAudioTrack(createdTrack);
          
          const actualDeviceId = createdTrack.mediaStreamTrack.getSettings().deviceId;
          if (actualDeviceId && actualDeviceId !== selectedAudioDevice) {
            setSelectedAudioDevice(actualDeviceId);
          }

          logEvent("PREVIEW_READY", { type: "audio", deviceId: actualDeviceId });
        } else {
          createdTrack.stop();
        }
      } catch (err: any) {
        if (active) {
          logEvent("prejoin_media_error", { type: "audio", error: String(err) });
          setAudioEnabled(false);
          setLocalAudioTrack(null);
        }
      }
    }

    updateAudioTrack();
    return () => {
      active = false;
      if (createdTrack && !hasSubmittedRef.current) {
        createdTrack.stop();
      }
    };
  }, [audioEnabled, selectedAudioDevice]);

  // Attach local video track to video tag
  useEffect(() => {
    const el = videoRef.current;
    if (el && localVideoTrack) {
      localVideoTrack.attach(el);
      return () => {
        localVideoTrack.detach(el);
      };
    }
  }, [localVideoTrack]);

  // General unmount cleanup (if user exits/navigates away without submitting)
  useEffect(() => {
    return () => {
      if (videoTrackRef.current) {
        videoTrackRef.current.stop();
      }
      if (audioTrackRef.current) {
        audioTrackRef.current.stop();
      }
    };
  }, []);

  const handleDeviceChange = (kind: "videoinput" | "audioinput", deviceId: string) => {
    if (kind === "videoinput") {
      setSelectedVideoDevice(deviceId);
    } else {
      setSelectedAudioDevice(deviceId);
    }
  };

  const handleSubmit = () => {
    if (isJoining) return;
    hapticTap();
    hasSubmittedRef.current = true;
    
    const videoTrack = videoTrackRef.current || undefined;
    const audioTrack = audioTrackRef.current || undefined;

    // Clear reference from pre-join component so the unmount hook does NOT stop them
    videoTrackRef.current = null;
    audioTrackRef.current = null;

    onSubmit(
      {
        videoEnabled,
        audioEnabled,
        videoDeviceId: selectedVideoDevice,
        audioDeviceId: selectedAudioDevice,
        username: userName,
      },
      {
        videoTrack,
        audioTrack,
      }
    );
  };

  const videoDevices = devices.filter((d) => d.kind === "videoinput");
  const audioDevices = devices.filter((d) => d.kind === "audioinput");

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-4 sm:p-6 sm:px-12 bg-overlay">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-8 items-center h-full sm:h-auto text-white">
        {/* Left side: Video Preview */}
        <div className="md:col-span-8 flex flex-col h-full sm:h-auto justify-center relative">
          <div className="relative aspect-[3/4] sm:aspect-video w-full overflow-hidden rounded-[2rem] bg-app-bg border border-call-border shadow-[0_32px_64px_rgba(0,0,0,0.4)]">
            
            {isLoading && videoEnabled ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-app-bg">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
                  <p className="text-sm font-medium text-white/60 animate-pulse">Requesting camera access...</p>
                </div>
              </div>
            ) : null}

            {isJoining && (
              <div className="absolute inset-0 z-40 bg-black/40 backdrop-blur-md flex flex-col items-center justify-center transition-all duration-300">
                <div className="flex gap-4 mb-4">
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-full bg-white/20", audioEnabled && "animate-pulse")}>
                    {audioEnabled ? <Mic className="h-5 w-5 text-white" /> : <MicOff className="h-5 w-5 text-white/50" />}
                  </div>
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-full bg-white/20", videoEnabled && "animate-pulse")}>
                    {videoEnabled ? <Camera className="h-5 w-5 text-white" /> : <CameraOff className="h-5 w-5 text-white/50" />}
                  </div>
                </div>
                <div className="text-white font-medium flex items-center">
                  <div className="mr-3 h-4 w-4 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                  Connecting to secure room...
                </div>
              </div>
            )}

            {videoEnabled && localVideoTrack && !error ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center space-y-4 px-6 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
                  <CameraOff className="h-8 w-8 text-white/30" />
                </div>
                {error ? (
                  <div className="max-w-xs space-y-2">
                    <p className="text-sm font-medium text-red-400">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-2 text-black bg-white/90 hover:bg-white border-none rounded-xl">
                      Retry Permissions
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                        setVideoEnabled(false);
                        setAudioEnabled(true);
                    }} className="mt-2 w-full text-white/70 hover:text-white hover:bg-white/10 rounded-xl">
                      <Mic className="mr-2 h-4 w-4" /> Join with audio only
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-white/40">Camera is off</p>
                )}
              </div>
            )}

            <div className="absolute bottom-6 left-6 rounded-full bg-black/40 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur-md border border-white/10 shadow-xl z-30">
              {userName} (You)
            </div>

            {otherPartyWaiting && (
              <div className="absolute top-6 left-6 z-30 animate-pulse rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 border border-emerald-500/20 shadow-xl backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block mr-1.5" />
                Other person is waiting in the room
              </div>
            )}
            
            <div className="absolute bottom-6 right-6 flex gap-3 md:hidden z-30">
              <button
                type="button"
                onClick={() => setAudioEnabled(!audioEnabled)}
                disabled={isJoining}
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-95 shadow-xl border",
                  audioEnabled 
                    ? "bg-white/20 text-white hover:bg-white/30 border-white/10" 
                    : "bg-red-500/90 text-white hover:bg-red-500 border-red-500/50",
                  isJoining && "opacity-50 pointer-events-none"
                )}
                aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
              >
                {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={() => setVideoEnabled(!videoEnabled)}
                disabled={isJoining}
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-95 shadow-xl border",
                  videoEnabled 
                    ? "bg-white/20 text-white hover:bg-white/30 border-white/10" 
                    : "bg-red-500/90 text-white hover:bg-red-500 border-red-500/50",
                  isJoining && "opacity-50 pointer-events-none"
                )}
                aria-label={videoEnabled ? "Turn camera off" : "Turn camera on"}
              >
                {videoEnabled ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right side: Controls & Join */}
        <div className="md:col-span-4 flex flex-col justify-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl font-display">Ready to join?</h1>
            <p className="text-sm text-white/45">Review your settings before joining the secure medical consultation.</p>
          </div>

          <div className="space-y-4 rounded-[2rem] border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-md">
            {/* Camera Select */}
            {videoEnabled && videoDevices.length > 0 && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/35">Camera</label>
                <Select
                  value={selectedVideoDevice}
                  onValueChange={(val) => { if (val) handleDeviceChange("videoinput", val); }}
                >
                  <SelectTrigger className="h-12 w-full rounded-2xl border-white/[0.08] bg-white/[0.03] text-sm text-white/80 hover:bg-white/[0.06] hover:text-white transition">
                    <SelectValue placeholder="Select Camera" />
                  </SelectTrigger>
                  <SelectContent className="border-call-border bg-panel text-white rounded-2xl">
                    {videoDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId} className="rounded-xl hover:bg-white/5 cursor-pointer">
                        {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Mic Select */}
            {audioEnabled && audioDevices.length > 0 && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/35">Microphone</label>
                <Select
                  value={selectedAudioDevice}
                  onValueChange={(val) => { if (val) handleDeviceChange("audioinput", val); }}
                >
                  <SelectTrigger className="h-12 w-full rounded-2xl border-white/[0.08] bg-white/[0.03] text-sm text-white/80 hover:bg-white/[0.06] hover:text-white transition">
                    <SelectValue placeholder="Select Microphone" />
                  </SelectTrigger>
                  <SelectContent className="border-call-border bg-panel text-white rounded-2xl">
                    {audioDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId} className="rounded-xl hover:bg-white/5 cursor-pointer">
                        {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Hardware Controls */}
            <div className="hidden md:flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAudioEnabled(!audioEnabled)}
                disabled={isJoining}
                className={cn(
                  "h-12 flex-1 rounded-2xl border-white/[0.08] text-sm transition-all duration-200 active:scale-95 cursor-pointer",
                  audioEnabled 
                    ? "bg-white/[0.03] text-white hover:bg-white/[0.08] hover:text-white" 
                    : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:text-red-400"
                )}
              >
                {audioEnabled ? <Mic className="mr-2 h-4 w-4 text-white/50" /> : <MicOff className="mr-2 h-4 w-4" />}
                {audioEnabled ? "Mic On" : "Mic Off"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setVideoEnabled(!videoEnabled)}
                disabled={isJoining}
                className={cn(
                  "h-12 flex-1 rounded-2xl border-white/[0.08] text-sm transition-all duration-200 active:scale-95 cursor-pointer",
                  videoEnabled 
                    ? "bg-white/[0.03] text-white hover:bg-white/[0.08] hover:text-white" 
                    : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:text-red-400"
                )}
              >
                {videoEnabled ? <Camera className="mr-2 h-4 w-4 text-white/50" /> : <CameraOff className="mr-2 h-4 w-4" />}
                {videoEnabled ? "Camera On" : "Camera Off"}
              </Button>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isJoining || isLoading}
            className="h-14 w-full rounded-2xl bg-brand text-base font-bold text-white shadow-medium hover:bg-brand/90 hover:shadow-xl active:scale-[0.98] transition-all cursor-pointer"
          >
            {isJoining ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Joining...
              </span>
            ) : (
              "Join Consultation"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
