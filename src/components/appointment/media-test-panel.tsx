"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, CameraOff, CheckCircle2, Mic, MicOff, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MediaTestPanelProps {
  className?: string;
  onMediaReady?: (stream: MediaStream) => void;
}

export function MediaTestPanel({ className, onMediaReady }: MediaTestPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const startMedia = useCallback(async (video: boolean, audio: boolean) => {
    try {
      setError(null);

      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      if (!video && !audio) {
        setStream(null);
        setMicLevel(0);
        return;
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: video ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false,
        audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
      });

      setStream(newStream);
      setReady(true);
      onMediaReady?.(newStream);

      if (videoRef.current && video) {
        videoRef.current.srcObject = newStream;
      }

      if (audio) {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(newStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setError("Camera/microphone access was denied. Please allow access in your browser settings.");
        } else if (err.name === "NotFoundError") {
          setError("No camera or microphone found. Please connect a device.");
        } else {
          setError("Could not access camera/microphone. Please check your device.");
        }
      }
    }
  }, [onMediaReady]);

  useEffect(() => {
    startMedia(cameraOn, micOn);
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCamera = () => {
    const next = !cameraOn;
    setCameraOn(next);
    startMedia(next, micOn);
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    startMedia(cameraOn, next);
  };

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-gray-200/60 bg-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-gray-900">Media check</h3>
        {ready && !error ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            Ready
          </span>
        ) : null}
      </div>

      {/* Video preview */}
      <div className="relative aspect-video bg-gray-900">
        {cameraOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-center">
              <CameraOff className="mx-auto h-8 w-8 text-white/20" />
              <p className="mt-2 text-xs text-white/30">Camera off</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 p-4">
            <div className="text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => startMedia(cameraOn, micOn)}
                className="mt-3 gap-1.5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Mic level + controls */}
      <div className="px-5 py-4">
        {micOn && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <Mic className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[11px] font-medium text-gray-500">Microphone level</span>
            </div>
            <div className="flex gap-[3px]">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-2 flex-1 rounded-full transition-all duration-75",
                    i < Math.round(micLevel / 5)
                      ? i < 12 ? "bg-emerald-400" : i < 16 ? "bg-amber-400" : "bg-red-400"
                      : "bg-gray-100",
                  )}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggleCamera}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition",
              cameraOn
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-gray-50 text-gray-500",
            )}
          >
            {cameraOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
            {cameraOn ? "Camera on" : "Camera off"}
          </button>
          <button
            type="button"
            onClick={toggleMic}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition",
              micOn
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-gray-50 text-gray-500",
            )}
          >
            {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            {micOn ? "Mic on" : "Mic off"}
          </button>
        </div>
      </div>
    </div>
  );
}
