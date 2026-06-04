"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff, Video } from "lucide-react";
import type { LocalUserChoices } from "@livekit/components-react";
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
  onSubmit: (values: LocalUserChoices) => void;
  patientName?: string;
  isJoining?: boolean;
  otherPartyWaiting?: boolean;
}

export function CustomPreJoin({ onSubmit, patientName = "Guest", isJoining = false, otherPartyWaiting = false }: CustomPreJoinProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>("");
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");

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

  useEffect(() => {
    let mounted = true;
    let activeStream: MediaStream | null = null;

    const initMedia = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const constraints: MediaStreamConstraints = {
          video: videoEnabled
            ? {
                deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : false,
          audio: audioEnabled
            ? {
                deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined,
              }
            : false,
        };

        if (constraints.video || constraints.audio) {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (mounted) {
            activeStream = stream;
            setPreviewStream(stream);
            
            const vTrack = stream.getVideoTracks()[0];
            const aTrack = stream.getAudioTracks()[0];
            if (vTrack && !selectedVideoDevice) {
              setSelectedVideoDevice(vTrack.getSettings().deviceId || "");
            }
            if (aTrack && !selectedAudioDevice) {
              setSelectedAudioDevice(aTrack.getSettings().deviceId || "");
            }
          } else {
            stream.getTracks().forEach((track) => track.stop());
          }
        } else {
          if (mounted) {
            setPreviewStream(null);
          }
        }
      } catch (err: any) {
        if (mounted) {
          logEvent("prejoin_media_error", { error: String(err) });
          if (err?.name === "NotReadableError") {
            setError("Camera is in use by another application. Please close other apps using the camera and try again.");
          } else if (err?.name === "NotAllowedError") {
            setError("Camera or microphone permission was denied. Please allow access in your browser settings.");
          } else {
            setError("Failed to access camera or microphone.");
          }
          setVideoEnabled(false);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initMedia();

    return () => {
      mounted = false;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [videoEnabled, audioEnabled, selectedVideoDevice, selectedAudioDevice]);

  // Attach stream to video tag
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

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
    
    // Stop the preview tracks before calling onSubmit to release resources
    if (previewStream) {
      previewStream.getTracks().forEach((track) => track.stop());
      setPreviewStream(null);
    }

    onSubmit({
      videoEnabled,
      audioEnabled,
      videoDeviceId: selectedVideoDevice,
      audioDeviceId: selectedAudioDevice,
      username: patientName,
    });
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-4 sm:p-6 sm:px-12 bg-[#060B14]">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-8 items-center h-full sm:h-auto">
        {/* Left side: Video Preview */}
        <div className="md:col-span-8 flex flex-col h-full sm:h-auto justify-center relative">
          <div className="relative aspect-[3/4] sm:aspect-video w-full overflow-hidden rounded-[2rem] bg-[#111113] border border-white/5 shadow-[0_32px_64px_rgba(0,0,0,0.4)]">
            
            {isLoading ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#111113]">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
                  <p className="text-sm font-medium text-white/60 animate-pulse">Requesting camera access...</p>
                </div>
              </div>
            ) : null}

            {/* Blur Overlay */}
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

            {videoEnabled && previewStream && !error ? (
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
                        onSubmit({ videoEnabled: false, audioEnabled: true, videoDeviceId: selectedVideoDevice, audioDeviceId: selectedAudioDevice, username: patientName });
                    }} className="mt-2 w-full text-white/70 hover:text-white hover:bg-white/10 rounded-xl">
                      <Mic className="mr-2 h-4 w-4" /> Join with audio only
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-white/40">Camera is off</p>
                )}
              </div>
            )}

            {/* Floating Badge */}
            <div className="absolute bottom-6 left-6 rounded-full bg-black/40 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur-md border border-white/10 shadow-xl z-30">
              {patientName} (You)
            </div>

            {otherPartyWaiting && (
              <div className="absolute top-6 left-6 z-30 animate-pulse rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 border border-emerald-500/20 shadow-xl backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block mr-1.5" />
                Other person is waiting in the room
              </div>
            )}
            
            {/* Embedded Mobile Toggles */}
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
              >
                {videoEnabled ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right side: Controls & Join */}
        <div className="md:col-span-4 flex w-full flex-col space-y-6 pb-8 md:pb-0 z-10">
          <div className="space-y-2 text-center md:text-left">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Ready to join?</h1>
            <p className="text-sm text-white/50">Configure your devices before entering the consultation.</p>
          </div>

          <div className="hidden md:flex flex-col gap-3 rounded-[1.5rem] bg-white/[0.03] p-5 border border-white/[0.08] shadow-lg backdrop-blur-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white/80">Microphone</span>
                <button
                  disabled={isJoining}
                  onClick={() => setAudioEnabled(!audioEnabled)}
                  className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                    audioEnabled ? "bg-brand" : "bg-white/20",
                    isJoining && "opacity-50 pointer-events-none"
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
              <Select disabled={isJoining} value={selectedAudioDevice} onValueChange={(val) => { if (val) handleDeviceChange("audioinput", val); }}>
                <SelectTrigger className="w-full h-8 text-xs bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select Microphone" />
                </SelectTrigger>
                <SelectContent className="bg-[#161618] border-white/10 text-white">
                  {devices.filter(d => d.kind === "audioinput").map(device => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${device.deviceId.slice(0, 5)}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="h-px w-full bg-white/5 my-1" />
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white/80">Camera</span>
                <button
                  disabled={isJoining}
                  onClick={() => setVideoEnabled(!videoEnabled)}
                  className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                    videoEnabled ? "bg-brand" : "bg-white/20",
                    isJoining && "opacity-50 pointer-events-none"
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
              <Select disabled={isJoining} value={selectedVideoDevice} onValueChange={(val) => { if (val) handleDeviceChange("videoinput", val); }}>
                <SelectTrigger className="w-full h-8 text-xs bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select Camera" />
                </SelectTrigger>
                <SelectContent className="bg-[#161618] border-white/10 text-white">
                  {devices.filter(d => d.kind === "videoinput").map(device => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${device.deviceId.slice(0, 5)}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            size="lg"
            disabled={isLoading || isJoining}
            className="w-full h-14 rounded-[1.2rem] bg-brand text-base font-bold text-white shadow-[0_8px_32px_rgba(88,155,255,0.3)] hover:bg-brand/90 hover:shadow-[0_12px_40px_rgba(88,155,255,0.4)] transition-all active:scale-[0.98] disabled:opacity-70"
            onClick={handleSubmit}
          >
            <Video className="mr-2 h-5 w-5" />
            {isJoining ? "Joining..." : "Join Consultation"}
          </Button>
        </div>
      </div>
    </div>
  );
}


