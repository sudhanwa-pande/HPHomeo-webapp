"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/* ─── Drag position helpers ─────────────────────────────────────── */

const PIP_WIDTH_SM = 320; // matches sm:w-[320px]
const PIP_MARGIN = 16;    // gap from viewport edge

function getDefaultPos(el?: HTMLDivElement | null): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const elW = el?.offsetWidth ?? PIP_WIDTH_SM;
  const elH = el?.offsetHeight ?? 252;
  return {
    x: window.innerWidth - elW - PIP_MARGIN,
    y: window.innerHeight - elH - PIP_MARGIN,
  };
}

function clampPos(
  x: number,
  y: number,
  elW: number,
  elH: number,
): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  return {
    x: Math.max(PIP_MARGIN, Math.min(x, window.innerWidth - elW - PIP_MARGIN)),
    y: Math.max(PIP_MARGIN, Math.min(y, window.innerHeight - elH - PIP_MARGIN)),
  };
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

  /* ── Drag state ── */
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
  } | null>(null);

  // Initialize position to bottom-right when minimized is first true
  useEffect(() => {
    if (minimized && pos === null && typeof window !== "undefined") {
      setPos(getDefaultPos(containerRef.current));
    }
  }, [minimized]); // intentionally omit `pos` to avoid re-init on moves

  // Clamp to viewport (memoized)
  const clamp = useCallback((x: number, y: number) => {
    const el = containerRef.current;
    const elW = el?.offsetWidth ?? PIP_WIDTH_SM;
    const elH = el?.offsetHeight ?? 252;
    return clampPos(x, y, elW, elH);
  }, []);

  // Re-clamp when viewport resizes
  useEffect(() => {
    if (!minimized) return;
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minimized, clamp]);

  // Block text selection on body while dragging (prevents selecting prescription text)
  useEffect(() => {
    if (!isDragging) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [isDragging]);

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return; // left pointer only
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId); // capture so move fires even off-element
      dragStartRef.current = {
        px: e.clientX,
        py: e.clientY,
        ox: pos?.x ?? 0,
        oy: pos?.y ?? 0,
      };
      setIsDragging(true);
    },
    [pos],
  );

  const handleDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.px;
      const dy = e.clientY - dragStartRef.current.py;
      setPos(clamp(dragStartRef.current.ox + dx, dragStartRef.current.oy + dy));
    },
    [clamp],
  );

  const handleDragPointerUp = useCallback(() => {
    dragStartRef.current = null;
    setIsDragging(false);
  }, []);

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
    return (
      <div
        ref={containerRef}
        style={
          minimized && pos
            ? { left: pos.x, top: pos.y }
            : undefined
        }
        className={cn(
          "overflow-hidden rounded-2xl",
          minimized
            ? cn(
                "fixed z-50 w-[280px] border bg-[#111113] sm:w-[320px]",
                // Elevated shadow + ring during drag for visual feedback
                isDragging
                  ? "cursor-grabbing border-white/20 shadow-[0_24px_64px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)]"
                  : "cursor-default border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.45)]",
                // Smooth position transition only when NOT dragging (for snap/resize)
                !isDragging && "transition-[left,top] duration-200 ease-out",
                // Hide until position is computed (prevents SSR/top-left flash)
                !pos && "invisible",
              )
            : "border border-gray-200/60 bg-white transition-all duration-300",
        )}
      >
        {/* ── Drag handle (minimized only) ───────────────────────── */}
        {minimized && (
          <div
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
            onPointerCancel={handleDragPointerUp}
            className={cn(
              "flex h-8 select-none items-center gap-2 border-b border-white/[0.07] px-3",
              isDragging ? "cursor-grabbing" : "cursor-grab",
            )}
            // Stop propagation so clicks on drag handle don't bubble to any parent handlers
            onClick={(e) => e.stopPropagation()}
          >
            <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-white/25" />
            <span className="flex-1 truncate text-[11px] font-medium text-white/50">
              {appointment.patient.full_name}
            </span>
            {/* Subtle "move" hint — visible on hover only via group */}
            <span className="shrink-0 rounded-sm bg-white/[0.05] px-1 py-px text-[9px] font-medium uppercase tracking-wider text-white/20">
              move
            </span>
          </div>
        )}

        {/* ── Full-size header (not minimized) ───────────────────── */}
        {!minimized && (
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
            <div>
              <p className="text-sm font-semibold text-gray-900">Consultation workspace</p>
              <p className="mt-0.5 text-[11px] text-gray-400">Video and chat in one place</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
              In call
            </span>
          </div>
        )}

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
            minimized={minimized}
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

      <div className="bg-[#111113] p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold">{appointment.patient.full_name}</p>
            <p className="mt-0.5 text-xs text-white/40">
              {format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy - hh:mm a")}
            </p>
          </div>
          <div className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium text-white/50">
            {appointment.call_status === "waiting" ||
            appointment.call_status === "connected" ||
            appointment.call_status === "disconnected"
              ? "Resume ready"
              : "Ready"}
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => setMediaPreferences((c) => ({ ...c, video: !c.video }))}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition",
              mediaPreferences.video
                ? "border-brand/20 bg-brand/[0.08]"
                : "border-white/[0.06] bg-white/[0.03]",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                mediaPreferences.video ? "bg-brand text-white" : "bg-white/[0.06] text-white/40",
              )}
            >
              {mediaPreferences.video ? (
                <Camera className="h-3.5 w-3.5" />
              ) : (
                <CameraOff className="h-3.5 w-3.5" />
              )}
            </div>
            <span className="flex-1 text-sm font-medium text-white/80">Camera</span>
            <span
              className={cn(
                "text-[10px] font-semibold",
                mediaPreferences.video ? "text-brand" : "text-white/30",
              )}
            >
              {mediaPreferences.video ? "ON" : "OFF"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMediaPreferences((c) => ({ ...c, audio: !c.audio }))}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition",
              mediaPreferences.audio
                ? "border-brand/20 bg-brand/[0.08]"
                : "border-white/[0.06] bg-white/[0.03]",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                mediaPreferences.audio ? "bg-brand text-white" : "bg-white/[0.06] text-white/40",
              )}
            >
              {mediaPreferences.audio ? (
                <Mic className="h-3.5 w-3.5" />
              ) : (
                <MicOff className="h-3.5 w-3.5" />
              )}
            </div>
            <span className="flex-1 text-sm font-medium text-white/80">Microphone</span>
            <span
              className={cn(
                "text-[10px] font-semibold",
                mediaPreferences.audio ? "text-brand" : "text-white/30",
              )}
            >
              {mediaPreferences.audio ? "ON" : "OFF"}
            </span>
          </button>
        </div>

        {joinError ? (
          <div className="mt-3 rounded-xl border border-red-500/15 bg-red-500/[0.07] p-3 text-sm">
            <p className="font-medium text-red-300">Media issue</p>
            <p className="mt-0.5 text-red-300/60">{joinError}</p>
          </div>
        ) : null}

        <div className="mt-4 grid gap-2">
          <Button
            className="h-11 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand/90"
            loading={joining}
            onClick={() => void joinCall()}
          >
            <Phone className="h-4 w-4" />
            {consultationLabel}
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl border-white/[0.08] bg-transparent text-sm text-white/60 hover:bg-white/[0.06] hover:text-white"
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
        {/* Video area — not draggable, pointer-events normal for video */}
        <div className="relative aspect-video bg-[#111113]">
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

            {/* End call */}
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-full bg-red-500 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-60"
              disabled={endLoading}
              onClick={(e) => {
                e.stopPropagation();
                onEnd();
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

        <RoomAudioRenderer />
      </div>
    );
  }

  /* ── Full-size layout ─────────────────────────────────────────── */
  return (
    <div>
      {/* Video area */}
      <div className="relative bg-[#111113]">
        <div className="relative h-[400px] sm:h-[460px] xl:h-[520px]">
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
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-md">
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

          {/* Local PiP */}
          <div className="absolute bottom-3 right-3 w-[120px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1a1f] shadow-lg">
            <div className="aspect-[3/4]">
              {localVideoTrack ? (
                <VideoTrack
                  trackRef={localVideoTrack}
                  className="h-full w-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <CameraOff className="h-5 w-5 text-white/20" />
                </div>
              )}
            </div>
            <div className="absolute bottom-1.5 left-1.5">
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full",
                  isMicrophoneEnabled ? "bg-black/40 backdrop-blur-sm" : "bg-red-500/90",
                )}
              >
                {isMicrophoneEnabled ? (
                  <Mic className="h-2.5 w-2.5 text-white/80" />
                ) : (
                  <MicOff className="h-2.5 w-2.5 text-white" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => void toggleMic()}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition",
              isMicrophoneEnabled
                ? "bg-white/[0.10] text-white hover:bg-white/[0.16]"
                : "bg-red-500/90 text-white hover:bg-red-500",
            )}
          >
            {isMicrophoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void toggleCamera()}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition",
              Boolean(localVideoTrack)
                ? "bg-white/[0.10] text-white hover:bg-white/[0.16]"
                : "bg-red-500/90 text-white hover:bg-red-500",
            )}
          >
            {Boolean(localVideoTrack) ? (
              <Camera className="h-4 w-4" />
            ) : (
              <CameraOff className="h-4 w-4" />
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
              "relative flex h-10 w-10 items-center justify-center rounded-full transition",
              chatOpen
                ? "bg-white/[0.14] text-white"
                : "bg-white/[0.08] text-white/60 hover:bg-white/[0.12]",
            )}
          >
            <MessageSquare className="h-4 w-4" />
            {unreadMessages > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                {unreadMessages > 9 ? "9+" : unreadMessages}
              </span>
            ) : null}
          </button>

          <div className="mx-1 h-6 w-px bg-white/[0.08]" />

          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-full bg-red-500 px-4 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-60"
            disabled={endLoading}
            onClick={onEnd}
          >
            <PhoneOff className="h-4 w-4" />
            <span className="hidden sm:inline">{endLabel}</span>
          </button>
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
