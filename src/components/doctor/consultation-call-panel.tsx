"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useDragControls } from "framer-motion";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useChat,
  useConnectionState,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { isTrackReference, type TrackReference } from "@livekit/components-core";
import { ConnectionState, Track } from "livekit-client";
import {
  Camera,
  CameraOff,
  GripHorizontal,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Send,
  User,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";

import api from "@/lib/api";
import {
  buildPreferredAudioConstraints,
  buildPreferredVideoConstraints,
  getMediaDeviceErrorMessage,
  LIVEKIT_AUDIO_CAPTURE_OPTIONS,
  LIVEKIT_ROOM_OPTIONS,
  prepareMediaChoices,
} from "@/lib/media";
import { hapticPulse, hapticSuccess, hapticTap, hapticWarning } from "@/lib/haptics";
import { notifyApiError, notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import { playIncomingMessageSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DoctorAppointmentDetail, VideoTokenResponse } from "@/types/doctor";

type MediaPreferences = {
  audio: boolean;
  video: boolean;
};

function getPublishedTrack(track: unknown): TrackReference | undefined {
  return isTrackReference(track) && track.publication?.track ? track : undefined;
}

function formatConnectionLabel(connectionState: ConnectionState, remoteCount: number) {
  if (connectionState === ConnectionState.Connected) {
    return remoteCount > 0 ? "Live" : "Waiting";
  }
  if (connectionState === ConnectionState.Connecting) return "Connecting";
  if (connectionState === ConnectionState.Reconnecting) return "Reconnecting";
  return "Offline";
}

/* ─── Main component ────────────────────────────────────────────── */

export function ConsultationCallPanel({
  appointmentId,
  appointment,
  minimized = false,
  onMaximize,
}: {
  appointmentId: string;
  appointment: DoctorAppointmentDetail;
  minimized?: boolean;
  onMaximize?: () => void;
}) {
  const queryClient = useQueryClient();
  const [tokenData, setTokenData] = useState<VideoTokenResponse | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);
  const [mediaPreferences, setMediaPreferences] = useState<MediaPreferences>({
    audio: true,
    video: true,
  });

  /* ── Adaptive PiP State ── */
  const dragControls = useDragControls();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [bounds, setBounds] = useState({ top: 0, left: 0, right: 0, bottom: 0 });
  
  const peekTimerRef = useRef<NodeJS.Timeout | null>(null);
  const peekStartedAtRef = useRef<number>(0);
  const lastUserYRef = useRef<number | null>(null);
  const wasInBottomHalfRef = useRef<boolean>(false);
  const interactionState = useRef<"idle" | "dragging" | "peeking">("idle");
  const maxVvHeightRef = useRef<number>(0);

  const calculateBounds = useCallback((width: number) => {
    if (typeof window === "undefined") return { top: 0, left: 0, right: 0, bottom: 0 };
    const vv = window.visualViewport;
    const vW = vv?.width || window.innerWidth;
    const vH = vv?.height || window.innerHeight;
    const oT = vv?.offsetTop || 0;
    const oL = vv?.offsetLeft || 0;
    return {
      top: Math.max(oT + 16, window.innerHeight > window.innerWidth ? 48 : 16),
      left: oL + 16,
      right: oL + vW - width - 16,
      bottom: oT + vH - (width * 0.75 + 40) - 16, 
    };
  }, []);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    };
  }, []);

  const handlePeek = () => {
    if (!isKeyboardOpen) return; // Only peek if currently shrunk
    if (interactionState.current === "dragging") return; // Prevent mid-drag triggers
    interactionState.current = "peeking";
    setIsPeeking(true);
    peekStartedAtRef.current = Date.now();
    setBounds(calculateBounds(200)); // Atomically update bounds

    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    peekTimerRef.current = setTimeout(() => {
      // Bulletproof background race prevention
      if (Date.now() - peekStartedAtRef.current >= 2400) {
        setIsPeeking(false);
        setBounds(calculateBounds(140)); // Sync bounds atomically
        if (interactionState.current === "peeking") {
          interactionState.current = "idle";
        }
      }
    }, 2500); // 2.5s base, resets on tap
  };

  // App lifecycle handling (visibility, lock screen, app switch)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
        setIsPeeking(false);
        setIsKeyboardOpen(false);
        setBounds(calculateBounds(180));
        lastUserYRef.current = null;
        interactionState.current = "idle";
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onVisibilityChange);
    };
  }, []);

  // Orientation change = cancel peek mode and reset safe defaults
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOrientationChange = () => {
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
      setIsPeeking(false);
      setIsKeyboardOpen(false);
      setBounds(calculateBounds(180));
      lastUserYRef.current = null; // Clears manual drag memory so it safely snaps
      interactionState.current = "idle";
      
      // Reset max to prevent drift
      if (window.visualViewport) {
        maxVvHeightRef.current = window.visualViewport.height || window.innerHeight;
      }
    };
    window.addEventListener("orientationchange", onOrientationChange);
    return () => window.removeEventListener("orientationchange", onOrientationChange);
  }, []);

  // Keyboard detection (hybrid with debounce) & Atomic bounds recalculation
  useEffect(() => {
    if (!minimized || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    if (maxVvHeightRef.current === 0) {
      maxVvHeightRef.current = vv.height;
    }

    let timeoutId: NodeJS.Timeout;

    const onResize = () => {
      if (vv.height > maxVvHeightRef.current) {
        maxVvHeightRef.current = vv.height;
      }

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        // Hybrid check: maxVvHeight minus visual viewport safely detects keyboard on iOS Safari
        const keyboardOpen = maxVvHeightRef.current - vv.height > 150;
        const willBePeeking = keyboardOpen ? isPeeking : false;
        
        setIsKeyboardOpen(keyboardOpen);
        if (!keyboardOpen) setIsPeeking(false);
        
        // 1. Update bounds FIRST (atomically batched with state updates)
        // 2. Framer motion applies dragConstraints 
        // 3. Animation begins to new x/y safely without jumps
        const nextPipWidth = willBePeeking ? 200 : keyboardOpen ? 140 : 180;
        setBounds(calculateBounds(nextPipWidth));
      }, 200); // 200ms debounce prevents jitter during Android keyboard animation
    };

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    // Initial bounds sync
    onResize();

    return () => {
      clearTimeout(timeoutId);
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [minimized, isPeeking, calculateBounds]);

  // Dimensions
  const pipWidth = isPeeking ? 200 : isKeyboardOpen ? 140 : 180;

  /* ── Call logic ── */
  const canStartConsultation =
    appointment.mode === "online" &&
    appointment.video_enabled &&
    appointment.status === "confirmed";
  const consultationLabel =
    appointment.call_status === "waiting" ||
    appointment.call_status === "connected" ||
    appointment.call_status === "disconnected"
      ? "Continue consultation"
      : "Start consultation";

  const joinCall = async (options?: Partial<MediaPreferences>) => {
    const wantsAudio = options?.audio ?? mediaPreferences.audio;
    const wantsVideo = options?.video ?? mediaPreferences.video;
    setJoining(true);
    setJoinError(null);
    try {
      const prepared = await prepareMediaChoices({ audio: wantsAudio, video: wantsVideo });
      setMediaPreferences({ audio: prepared.audio, video: prepared.video });
      if (prepared.warning) notifyInfo("Joining with available devices", prepared.warning);
      const { data } = await api.post<VideoTokenResponse>(
        `/doctor/appointments/${appointmentId}/video-token`,
      );
      hapticSuccess();
      setCallEnded(false);
      setTokenData(data);
    } catch (error) {
      const message = getMediaDeviceErrorMessage(error);
      setJoinError(message);
      if (
        error instanceof Error &&
        ["NotAllowedError", "NotFoundError", "NotReadableError", "AbortError"].includes(error.name)
      ) {
        notifyError("Couldn't start media", message);
      } else {
        notifyApiError(error, "Couldn't start call");
      }
    } finally {
      setJoining(false);
    }
  };

  const endCallMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/doctor/appointments/${appointmentId}/call/end`);
    },
    onSuccess: async () => {
      hapticPulse();
      notifySuccess("Call ended", "The consultation session has been closed.");
      setCallEnded(true);
      setTokenData(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["doctor-waiting"] }),
        queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["doctor-appointment-detail", appointmentId] }),
      ]);
    },
    onError: (error) => notifyApiError(error, "Couldn't end call"),
  });

  const handleMediaDeviceFailure = (_failure?: unknown, kind?: string) => {
    const message =
      kind === "audioinput"
        ? "Microphone access failed. You can stay in the call muted."
        : "Camera access failed. You can stay in the call without video.";
    setJoinError(message);
    notifyError("Media access issue", message);
  };

  const handleDisconnected = () => {
    setJoinError("Connection dropped. Rejoin the consultation to continue.");
    setTokenData(null);
  };

  if (!canStartConsultation) {
    if (minimized) return null;
    return (
      <section className="rounded-2xl border border-gray-200/60 bg-white p-5">
        <p className="text-sm font-semibold text-gray-900">Consultation workspace</p>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
          Video consultation is available only for confirmed online appointments.
        </p>
      </section>
    );
  }

  // No active call + floating mode → render nothing (no pre-join UI in PiP)
  if (minimized && !tokenData) return null;

  // Active call — layout adapts via `minimized`
  if (tokenData) {
    if (!minimized) {
      return (
        <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white transition-all duration-300">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <div>
              <p className="text-sm font-semibold text-gray-900">Consultation workspace</p>
              <p className="mt-0.5 text-[11px] text-gray-400">Video and chat in one place</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
              In call
            </span>
          </div>

          <LiveKitRoom
            key={appointmentId}
            serverUrl={tokenData.server_url}
            token={tokenData.token}
            connect
            audio={buildPreferredAudioConstraints(mediaPreferences.audio)}
            video={buildPreferredVideoConstraints(mediaPreferences.video)}
            options={LIVEKIT_ROOM_OPTIONS}
            onMediaDeviceFailure={handleMediaDeviceFailure}
            onDisconnected={handleDisconnected}
          >
            <CallRoomContent
              minimized={false}
              patientName={appointment.patient.full_name}
              endLabel="End consultation"
              endLoading={endCallMutation.isPending}
              onEnd={() => endCallMutation.mutate()}
              onMaximize={onMaximize}
            />
          </LiveKitRoom>
        </div>
      );
    }

    // Minimized (PiP) Layout with Framer Motion Physics
    return (
      <motion.div
        role="dialog"
        aria-label="Video call window"
        drag
        dragControls={dragControls}
        dragListener={false} // Drag is explicitly handled by the grip icon only
        dragMomentum={false}
        dragElastic={0.05}
        dragConstraints={bounds}
        onDragStart={() => {
          if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
          setIsPeeking(false);
          interactionState.current = "dragging";
          setIsDragging(true);
        }}
        onDragEnd={(e, info) => {
          interactionState.current = "idle";
          setIsDragging(false);
          lastUserYRef.current = info.point.y;
          wasInBottomHalfRef.current = info.point.y > (typeof window !== 'undefined' ? window.innerHeight / 2 : 500);
          // Framer Motion internally clamps to dragConstraints if left out of bounds, 
          // preventing the "slow session drift" without needing manual setPosition state!
        }}
        onClick={() => {
          if (isDragging) return;
          if (interactionState.current === "idle" || interactionState.current === "peeking") {
             handlePeek();
          }
        }}
        initial={false}
        animate={{
          width: pipWidth,
          opacity: isKeyboardOpen && !isPeeking ? 0.85 : 1,
          // Smart snap: only force PiP to top-right if user left it in the bottom half
          x: isKeyboardOpen && (lastUserYRef.current === null || wasInBottomHalfRef.current) 
               ? bounds.right 
               : undefined,
          y: isKeyboardOpen && (lastUserYRef.current === null || wasInBottomHalfRef.current) 
               ? bounds.top 
               : undefined,
          scale: isDragging ? 1.02 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
        }}
        className={cn(
          "fixed z-[1000] overflow-hidden rounded-2xl border touch-manipulation",
          isDragging
            ? "cursor-grabbing border-brand/40 ring-2 ring-brand/20 shadow-[0_32px_64px_rgba(0,0,0,0.7)] bg-[#111113]/90 backdrop-blur-md"
            : "border-white/10",
          !isDragging && (isKeyboardOpen && !isPeeking 
             ? "bg-[#111113]/95 backdrop-blur-none shadow-lg" // Performance optimization for low-end Androids
             : "bg-[#111113]/90 backdrop-blur-md shadow-2xl")
        )}
        style={{
          // Set initial fallback position on mount before framer-motion takes over
          top: 0,
          left: 0,
          // Shift initial position out of view until constraints load, or snap to corner
          x: bounds.right || (typeof window !== 'undefined' ? window.innerWidth - pipWidth - 16 : 0),
          y: bounds.top || (typeof window !== 'undefined' && window.innerHeight > window.innerWidth ? 48 : 16),
        }}
      >
        {/* ── Drag handle ───────────────────────── */}
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragControls.start(e);
          }}
          className={cn(
            "absolute inset-x-0 top-0 z-10 flex h-10 touch-none select-none items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 transition-opacity duration-300",
            isDragging || isKeyboardOpen ? "opacity-100" : "opacity-0 hover:opacity-100",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <GripHorizontal className="h-4 w-4 shrink-0 text-white/60 drop-shadow-md" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              hapticTap();
              if (onMaximize) onMaximize();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/30"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        <LiveKitRoom
          key={appointmentId}
          serverUrl={tokenData.server_url}
          token={tokenData.token}
          connect
          audio={buildPreferredAudioConstraints(mediaPreferences.audio)}
          video={buildPreferredVideoConstraints(mediaPreferences.video)}
          options={LIVEKIT_ROOM_OPTIONS}
          onMediaDeviceFailure={handleMediaDeviceFailure}
          onDisconnected={handleDisconnected}
        >
          <CallRoomContent
            minimized={true}
            patientName={appointment.patient.full_name}
            endLabel="End consultation"
            endLoading={endCallMutation.isPending}
            onEnd={() => endCallMutation.mutate()}
            onMaximize={onMaximize}
          />
        </LiveKitRoom>
      </motion.div>
    );
  }

  // Pre-join UI — full-size only (minimized + no tokenData returns null above)
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
        <div>
          <p className="text-sm font-semibold text-gray-900">Consultation workspace</p>
          <p className="mt-0.5 text-[11px] text-gray-400">Video and chat in one place</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold",
            callEnded ? "bg-gray-100 text-gray-500" : "bg-brand/[0.06] text-brand",
          )}
        >
          {callEnded ? "Ended" : "Ready"}
        </span>
      </div>

      <div className="bg-[#050505] p-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{appointment.patient.full_name}</p>
            <p className="mt-1 text-xs text-white/50">
              {format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy - hh:mm a")}
            </p>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur-md shadow-sm">
            {appointment.call_status === "waiting" ||
            appointment.call_status === "connected" ||
            appointment.call_status === "disconnected"
              ? "Resume ready"
              : "Ready to join"}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setMediaPreferences((c) => ({ ...c, video: !c.video }))}
            className={cn(
              "flex flex-1 items-center gap-3 rounded-[1.2rem] border px-4 py-3.5 transition-all duration-200",
              mediaPreferences.video
                ? "border-brand/30 bg-brand/10 shadow-[0_4px_16px_rgba(88,155,255,0.1)]"
                : "border-white/10 bg-white/5 hover:bg-white/10",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                mediaPreferences.video ? "bg-brand text-white" : "bg-white/10 text-white/50",
              )}
            >
              {mediaPreferences.video ? (
                <Camera className="h-4 w-4" />
              ) : (
                <CameraOff className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 text-left">
              <span className="block text-sm font-semibold text-white">Camera</span>
              <span className="block text-[11px] font-medium text-white/50">
                {mediaPreferences.video ? "Enabled" : "Disabled"}
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMediaPreferences((c) => ({ ...c, audio: !c.audio }))}
            className={cn(
              "flex flex-1 items-center gap-3 rounded-[1.2rem] border px-4 py-3.5 transition-all duration-200",
              mediaPreferences.audio
                ? "border-brand/30 bg-brand/10 shadow-[0_4px_16px_rgba(88,155,255,0.1)]"
                : "border-white/10 bg-white/5 hover:bg-white/10",
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                mediaPreferences.audio ? "bg-brand text-white" : "bg-white/10 text-white/50",
              )}
            >
              {mediaPreferences.audio ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 text-left">
              <span className="block text-sm font-semibold text-white">Microphone</span>
              <span className="block text-[11px] font-medium text-white/50">
                {mediaPreferences.audio ? "Enabled" : "Disabled"}
              </span>
            </div>
          </button>
        </div>

        {joinError ? (
          <div className="mt-4 rounded-[1rem] border border-red-500/20 bg-red-500/10 p-3.5 text-sm backdrop-blur-md">
            <p className="font-semibold text-red-400">Media access issue</p>
            <p className="mt-1 text-red-400/80 leading-relaxed">{joinError}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <Button
            className="h-14 rounded-[1.2rem] bg-brand text-sm font-bold text-white shadow-[0_8px_32px_rgba(88,155,255,0.3)] transition-all hover:-translate-y-0.5 hover:bg-brand/90 hover:shadow-[0_12px_40px_rgba(88,155,255,0.4)]"
            loading={joining}
            onClick={() => void joinCall()}
          >
            <Phone className="h-5 w-5 mr-2" />
            {consultationLabel}
          </Button>
          <Button
            variant="outline"
            className="h-12 rounded-[1.2rem] border-white/10 bg-transparent text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            disabled={joining}
            onClick={() => void joinCall({ audio: false, video: false })}
          >
            Join without media
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ─── Single call room content — layout adapts via minimized prop ── */

function CallRoomContent({
  minimized,
  patientName,
  endLabel,
  endLoading,
  onEnd,
  onMaximize,
}: {
  minimized: boolean;
  patientName: string;
  endLabel: string;
  endLoading: boolean;
  onEnd: () => void;
  onMaximize?: () => void;
}) {
  const remoteParticipants = useRemoteParticipants();
  const connectionState = useConnectionState();
  const {
    localParticipant,
    isCameraEnabled,
    isMicrophoneEnabled,
    lastCameraError,
    lastMicrophoneError,
  } = useLocalParticipant();
  const { chatMessages, send } = useChat();
  const [message, setMessage] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const chatBootstrappedRef = useRef(false);
  const chatMessageCountRef = useRef(0);

  const trackSources = useMemo(
    () => [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.Microphone, withPlaceholder: false },
    ],
    [],
  );
  const tracks = useTracks(trackSources, { onlySubscribed: false });
  const localVideoTrack = getPublishedTrack(
    tracks.find((track) => track.participant.isLocal && track.source === Track.Source.Camera),
  );
  const remoteVideoTrack = getPublishedTrack(
    tracks.find((track) => !track.participant.isLocal && track.source === Track.Source.Camera),
  );
  const connectionLabel = useMemo(
    () => formatConnectionLabel(connectionState, remoteParticipants.length),
    [connectionState, remoteParticipants.length],
  );
  const isConnected = connectionState === ConnectionState.Connected;
  const hasRemote = remoteParticipants.length > 0;

  useEffect(() => {
    if (lastCameraError) notifyError("Camera unavailable", getMediaDeviceErrorMessage(lastCameraError));
  }, [lastCameraError]);

  useEffect(() => {
    if (lastMicrophoneError) notifyError("Microphone unavailable", getMediaDeviceErrorMessage(lastMicrophoneError));
  }, [lastMicrophoneError]);

  useEffect(() => {
    if (!chatBootstrappedRef.current) {
      chatBootstrappedRef.current = true;
      chatMessageCountRef.current = chatMessages.length;
      return;
    }
    if (chatMessages.length <= chatMessageCountRef.current) return;
    const nextMessages = chatMessages.slice(chatMessageCountRef.current);
    chatMessageCountRef.current = chatMessages.length;
    const incomingMessages = nextMessages.filter((m) => !m.from?.isLocal);
    if (!incomingMessages.length) return;
    void playIncomingMessageSound();
    if (chatOpen) return;
    setUnreadMessages((c) => c + incomingMessages.length);
  }, [chatMessages, chatOpen]);

  const toggleMic = async () => {
    hapticTap();
    try {
      await localParticipant.setMicrophoneEnabled(
        !isMicrophoneEnabled,
        !isMicrophoneEnabled ? LIVEKIT_AUDIO_CAPTURE_OPTIONS : undefined,
      );
    } catch (error) {
      notifyError("Microphone update failed", getMediaDeviceErrorMessage(error));
    }
  };

  const toggleCamera = async () => {
    hapticTap();
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (error) {
      notifyError("Camera update failed", getMediaDeviceErrorMessage(error));
    }
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    await send(trimmed);
    setMessage("");
  };

  /* ── Minimized (floating PiP) layout ──────────────────────────── */
  if (minimized) {
    return (
      <div>
        {/* Video area — tappable to expand to full consultation view */}
        <div
          className="relative aspect-video cursor-pointer bg-[#111113]"
          role="button"
          tabIndex={0}
          onClick={() => { if (onMaximize) onMaximize(); }}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && onMaximize) { e.preventDefault(); onMaximize(); } }}
          title="Tap to expand"
        >
          {remoteVideoTrack ? (
            <VideoTrack trackRef={remoteVideoTrack} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]">
                  <User className="h-4.5 w-4.5 text-white/25" />
                </div>
                <p className="text-[11px] text-white/35">{patientName}</p>
                <p className="mt-0.5 text-[10px] text-white/20">Waiting for video</p>
              </div>
            </div>
          )}

          {/* Connection badge */}
          <div className="absolute left-2 top-2">
            <div className="flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium text-white/70 backdrop-blur-sm">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isConnected && hasRemote
                    ? "bg-emerald-400"
                    : isConnected
                      ? "animate-pulse bg-amber-400"
                      : "bg-white/30",
                )}
              />
              {connectionLabel}
            </div>
          </div>
        </div>

        {/* Controls bar */}
        <div className="flex items-center justify-between bg-[#111113] px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {/* Mic toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation(); // prevent any parent drag handlers
                void toggleMic();
              }}
              title={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                isMicrophoneEnabled
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-red-500/90 text-white hover:bg-red-500",
              )}
            >
              {isMicrophoneEnabled ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <MicOff className="h-3.5 w-3.5" />
              )}
            </button>

            {/* End call with confirm */}
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-full bg-red-500 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-60"
              disabled={endLoading}
              onClick={(e) => {
                e.stopPropagation();
                hapticWarning();
                setEndConfirmOpen(true);
              }}
            >
              <PhoneOff className="h-3 w-3" />
              End
            </button>
          </div>

          {/* Maximize */}
          {onMaximize && (
            <button
              type="button"
              title="Expand to full consultation view"
              onClick={(e) => {
                e.stopPropagation();
                onMaximize();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* End call confirmation overlay (minimized) */}
        {endConfirmOpen && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#1a1a1d]/95 backdrop-blur-sm px-3 py-3">
            <p className="mb-2 text-[12px] font-bold text-white">End this call?</p>
            <div className="flex w-full gap-2">
              <button
                type="button"
                className="flex-1 rounded-full bg-white/10 py-2 text-[11px] font-medium text-white/70 transition hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); setEndConfirmOpen(false); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-red-500 py-2 text-[11px] font-semibold text-white transition hover:bg-red-400 disabled:opacity-60"
                disabled={endLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  hapticPulse();
                  setEndConfirmOpen(false);
                  onEnd();
                }}
              >
                End call
              </button>
            </div>
          </div>
        )}

        <RoomAudioRenderer />
      </div>
    );
  }

  /* ── Full-size layout ─────────────────────────────────────────── */
  return (
    <div>
      {/* Video area */}
      <div className="relative bg-[#111113]">
        <div className="relative h-[220px] sm:h-[400px] xl:h-[520px]">
          {remoteVideoTrack ? (
            <VideoTrack trackRef={remoteVideoTrack} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="relative mx-auto h-20 w-20">
                  <span
                    className="absolute inset-0 rounded-full border border-white/[0.04]"
                    style={{ animation: "ping 4s cubic-bezier(0, 0, 0.2, 1) infinite" }}
                  />
                  <span
                    className="absolute inset-2 rounded-full border border-white/[0.06]"
                    style={{ animation: "ping 4s cubic-bezier(0, 0, 0.2, 1) infinite 1.3s" }}
                  />
                  <div className="absolute inset-4 flex items-center justify-center rounded-full bg-white/[0.06]">
                    <User className="h-6 w-6 text-white/25" />
                  </div>
                </div>
                <p className="mt-4 text-sm font-medium text-white/70">{patientName}</p>
                <p className="mt-1 text-xs text-white/30">Waiting for patient video</p>
              </div>
            </div>
          )}

          {/* Status overlay */}
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl bg-black/50 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur-md shadow-sm">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  isConnected && hasRemote
                    ? "bg-emerald-400"
                    : isConnected
                      ? "animate-pulse bg-amber-400"
                      : "bg-white/30",
                )}
              />
              {connectionLabel}
            </div>
          </div>

          {/* Local PiP */}
          <div className="absolute right-4 top-4 w-[100px] overflow-hidden rounded-[1rem] border border-white/20 bg-black/60 shadow-2xl backdrop-blur-sm sm:w-[140px]">
            <div className="aspect-[3/4]">
              {localVideoTrack ? (
                <VideoTrack
                  trackRef={localVideoTrack}
                  className="h-full w-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <CameraOff className="h-6 w-6 text-white/30" />
                </div>
              )}
            </div>
            <div className="absolute bottom-1.5 left-1.5">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full shadow-sm",
                  isMicrophoneEnabled ? "bg-black/60 backdrop-blur-md" : "bg-red-500",
                )}
              >
                {isMicrophoneEnabled ? (
                  <Mic className="h-3 w-3 text-white" />
                ) : (
                  <MicOff className="h-3 w-3 text-white" />
                )}
              </div>
            </div>
          </div>

          {/* Controls Overlay Bottom */}
          <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
            <div className="flex items-center justify-center gap-3 rounded-[2rem] bg-black/60 px-5 py-3 backdrop-blur-xl pointer-events-auto shadow-[0_16px_40px_rgba(0,0,0,0.5)] border border-white/10">
              <button
                type="button"
                onClick={() => void toggleMic()}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95",
                  isMicrophoneEnabled
                    ? "bg-white/10 text-white hover:bg-white/20"
                    : "bg-red-500 text-white shadow-[0_4px_16px_rgba(239,68,68,0.4)]",
                )}
              >
                {isMicrophoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={() => void toggleCamera()}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95",
                  Boolean(localVideoTrack)
                    ? "bg-white/10 text-white hover:bg-white/20"
                    : "bg-red-500 text-white shadow-[0_4px_16px_rgba(239,68,68,0.4)]",
                )}
              >
                {Boolean(localVideoTrack) ? (
                  <Camera className="h-5 w-5" />
                ) : (
                  <CameraOff className="h-5 w-5" />
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  setChatOpen((c) => {
                    const next = !c;
                    if (next) setUnreadMessages(0);
                    return next;
                  })
                }
                className={cn(
                  "relative flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95",
                  chatOpen
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-white hover:bg-white/20",
                )}
              >
                <MessageSquare className="h-5 w-5" />
                {unreadMessages > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white shadow-md">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                ) : null}
              </button>

              <div className="mx-2 h-8 w-px bg-white/20" />

              <button
                type="button"
                className="flex h-12 items-center gap-2 rounded-full bg-red-500 px-5 text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(239,68,68,0.4)] transition-all hover:bg-red-400 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
                disabled={endLoading}
                onClick={() => {
                  hapticWarning();
                  setEndConfirmOpen(true);
                }}
              >
                <PhoneOff className="h-5 w-5" />
                <span className="hidden sm:inline">{endLabel}</span>
              </button>
            </div>
          </div>

          {/* End call confirmation bar (Overlaid) */}
          {endConfirmOpen && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="rounded-[2rem] border border-white/10 bg-[#1a1a1d] px-8 py-6 text-center shadow-2xl">
                <p className="text-lg font-bold text-white">End this consultation?</p>
                <p className="mt-2 text-sm text-white/60">This action cannot be undone.</p>
                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    className="flex-1 rounded-[1.2rem] bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
                    onClick={() => setEndConfirmOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-[1.2rem] bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(239,68,68,0.4)] transition hover:bg-red-400 disabled:opacity-60"
                    disabled={endLoading}
                    onClick={() => {
                      hapticPulse();
                      setEndConfirmOpen(false);
                      onEnd();
                    }}
                  >
                    Yes, end call
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat */}
      {chatOpen ? (
        <div className="border-t border-gray-100">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">In-call chat</p>
            <p className="text-[11px] text-gray-400">Messages stay in this session</p>
          </div>

          <ScrollArea className="h-48 px-4">
            <div className="space-y-2.5 pb-3">
              {chatMessages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-[13px] text-gray-400">
                  No messages yet.
                </div>
              ) : null}

              {chatMessages.map((chatMessage, index) => {
                const isLocal = chatMessage.from?.isLocal;
                return (
                  <div
                    key={`${chatMessage.timestamp}-${index}`}
                    className={cn("flex", isLocal ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px]",
                        isLocal ? "bg-brand text-white" : "bg-gray-100 text-gray-900",
                      )}
                    >
                      <p
                        className={cn(
                          "mb-0.5 text-[10px] font-semibold",
                          isLocal ? "text-white/60" : "text-gray-400",
                        )}
                      >
                        {isLocal ? "You" : chatMessage.from?.name || patientName}
                      </p>
                      <p className="break-words leading-relaxed">{chatMessage.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="border-t border-gray-100 px-4 py-3">
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Type a message..."
                className="h-10 rounded-xl text-sm"
              />
              <button
                type="button"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand text-white transition hover:bg-brand/90 disabled:opacity-40"
                disabled={!message.trim()}
                onClick={() => void handleSend()}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <RoomAudioRenderer />
    </div>
  );
}
