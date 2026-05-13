"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { ArrowLeft, Camera, CameraOff, Loader2, Mic, MicOff, Phone, RefreshCw, User, Video } from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";

import { getApiError, getRateLimitDescription, isNetworkError, isRateLimitError } from "@/lib/api";
import {
  buildPreferredAudioConstraints,
  buildPreferredVideoConstraints,
  getFacingModeLabel,
  getMediaDeviceErrorMessage,
  LIVEKIT_ROOM_OPTIONS,
  prepareMediaChoices,
  type CameraFacingMode,
} from "@/lib/media";
import { notifyApiError, notifyError, notifyInfo } from "@/lib/notify";
import {
  createPublicAccessSession,
  publicApi,
  readPublicMagicTokenFromHash,
  scrubPublicMagicTokenFromUrl,
} from "@/lib/public-api";
import { useEventStream } from "@/hooks/use-event-stream";
import { LiveCallRoom } from "@/components/call/live-call-room";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicAppointment } from "@/types/public";
import type { VideoTokenResponse } from "@/types/doctor";

type MediaPreferences = {
  audio: boolean;
  video: boolean;
};


const PATIENT_VIDEO_JOIN_EARLY_MINUTES = 10;

function getPatientJoinWindow(scheduledAt: string, nowMs: number) {
  const scheduled = parseISO(scheduledAt);
  const opensAt = new Date(scheduled.getTime() - PATIENT_VIDEO_JOIN_EARLY_MINUTES * 60 * 1000);
  return { opensAt, tooEarly: nowMs < opensAt.getTime() };
}

function formatEarlyJoinDescription(scheduledAt: string, opensAt: Date) {
  return `Join opens ${PATIENT_VIDEO_JOIN_EARLY_MINUTES} minutes before your appointment. Appointment: ${format(parseISO(scheduledAt), "EEE, dd MMM yyyy - hh:mm a")}. Join available at ${format(opensAt, "hh:mm a")}.`;
}

function PublicCallPageClient() {
  const params = useParams<{ appointmentId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const appointmentId = params.appointmentId;
  const joinInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resumeStorageKey = `ehomeo:patient-call:${appointmentId}`;
  const resumeAttemptStorageKey = `${resumeStorageKey}:resume-lock`;

  const [accessReady, setAccessReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<VideoTokenResponse | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [mediaPreferences, setMediaPreferences] = useState<MediaPreferences>({ audio: true, video: true });
  const [preferredFacingMode, setPreferredFacingMode] = useState<CameraFacingMode>("user");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const clearResumeState = useCallback(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(resumeStorageKey);
    window.sessionStorage.removeItem(resumeAttemptStorageKey);
  }, [resumeAttemptStorageKey, resumeStorageKey]);

  const clearResumeAttemptLock = useCallback(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(resumeAttemptStorageKey);
  }, [resumeAttemptStorageKey]);

  const persistResumeState = useCallback(
    (preferences: MediaPreferences, facingMode: CameraFacingMode) => {
      if (typeof window === "undefined") return;
      window.sessionStorage.setItem(resumeStorageKey, JSON.stringify({ ...preferences, facingMode }));
    },
    [resumeStorageKey],
  );

  const videoOptions = useMemo(
    () => buildPreferredVideoConstraints(mediaPreferences.video, preferredFacingMode),
    [mediaPreferences.video, preferredFacingMode],
  );

  // Safety net: stop all camera/mic tracks when this page unmounts
  useEffect(() => {
    return () => {
      document.querySelectorAll("video, audio").forEach((el) => {
        const media = el as HTMLMediaElement;
        if (media.srcObject instanceof MediaStream) {
          media.srcObject.getTracks().forEach((t) => t.stop());
          media.srcObject = null;
        }
      });
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function bootstrapAccess() {
      try {
        const token = readPublicMagicTokenFromHash();
        if (token) {
          await createPublicAccessSession(appointmentId, token);
          scrubPublicMagicTokenFromUrl();
        }
        if (active) { setAccessReady(true); setAccessError(null); }
      } catch {
        if (active) { setAccessReady(true); setAccessError("invalid"); }
      }
    }
    void bootstrapAccess();
    return () => { active = false; };
  }, [appointmentId]);

  // SSE delivers instant updates; 30s poll is a safety net in case SSE drops
  const appointmentQuery = useQuery({
    queryKey: ["public-appointment-call", appointmentId],
    queryFn: async () => {
      const { data } = await publicApi.get<PublicAppointment>(`/public/appointments/${appointmentId}`);
      return data;
    },
    enabled: accessReady && Boolean(appointmentId),
    retry: false,
    refetchInterval: 30_000,
  });

  const appointment = appointmentQuery.data;
  const appointmentLoadError = appointmentQuery.error;
  const joinWindow = useMemo(
    () => (appointment ? getPatientJoinWindow(appointment.scheduled_at, nowMs) : null),
    [appointment, nowMs],
  );

  useEventStream({
    path: `/public/events/stream/${appointmentId}`,
    enabled: accessReady && !accessError && Boolean(appointmentId),
    onEvent: {
      call_state_changed: () => {
        queryClient.invalidateQueries({ queryKey: ["public-appointment-call", appointmentId] });
      },
      appointment_completed: () => {
        queryClient.invalidateQueries({ queryKey: ["public-appointment-call", appointmentId] });
      },
      appointment_no_show: () => {
        queryClient.invalidateQueries({ queryKey: ["public-appointment-call", appointmentId] });
      },
    },
    onReconnect: () => {
      queryClient.invalidateQueries({ queryKey: ["public-appointment-call", appointmentId] });
    },
  });

  // Polling fallback to detect status drift if SSE drops
  useEffect(() => {
    if (!tokenData) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["public-appointment-call", appointmentId] });
    }, 15000);
    return () => clearInterval(interval);
  }, [appointmentId, tokenData, queryClient]);

  const joinCall = useCallback(
    async (options?: Partial<MediaPreferences> & { facingMode?: CameraFacingMode }) => {
      if (joinInFlightRef.current) return;

      const wantsAudio = options?.audio ?? mediaPreferences.audio;
      const wantsVideo = options?.video ?? mediaPreferences.video;
      const nextFacingMode = options?.facingMode ?? preferredFacingMode;

      joinInFlightRef.current = true;
      setJoining(true);
      setJoinError(null);

      try {
        if (appointment?.scheduled_at && joinWindow?.tooEarly) {
          const earlyMessage = formatEarlyJoinDescription(appointment.scheduled_at, joinWindow.opensAt);
          setJoinError(earlyMessage);
          notifyInfo("Call not open yet", earlyMessage);
          return;
        }

        setMediaPreferences({ audio: wantsAudio, video: wantsVideo });
        persistResumeState({ audio: wantsAudio, video: wantsVideo }, nextFacingMode);

        const { data } = await publicApi.post<VideoTokenResponse>(
          `/public/appointments/${appointmentId}/video-token`,
          {},
        );
        if (isMountedRef.current) {
          setTokenData(data);
        }
        // callStartedAt is set via onConnected when the room actually connects.
      } catch (error) {
        const apiMessage = getApiError(error);
        if (apiMessage !== "An unexpected error occurred.") {
          const nextMessage =
            apiMessage.includes("You can join") && appointment?.scheduled_at
              ? formatEarlyJoinDescription(
                  appointment.scheduled_at,
                  joinWindow?.opensAt ??
                    new Date(
                      parseISO(appointment.scheduled_at).getTime() -
                        PATIENT_VIDEO_JOIN_EARLY_MINUTES * 60 * 1000,
                    ),
                )
              : apiMessage;
          setJoinError(nextMessage);
          if (apiMessage.includes("You can join")) {
            notifyInfo("Call not open yet", nextMessage);
          } else {
            notifyError("Couldn't join call", nextMessage);
          }
          return;
        }

        const message = getMediaDeviceErrorMessage(error);
        setJoinError(message);
        if (
          error instanceof Error &&
          ["NotAllowedError", "NotFoundError", "NotReadableError", "AbortError"].includes(error.name)
        ) {
          notifyError("Couldn't start media", message);
        } else {
          notifyApiError(error, "Couldn't join call");
        }
      } finally {
        joinInFlightRef.current = false;
        clearResumeAttemptLock();
        if (isMountedRef.current) {
          setJoining(false);
        }
      }
    },
    [
      appointment,
      appointmentId,
      clearResumeAttemptLock,
      joinWindow,
      mediaPreferences.audio,
      mediaPreferences.video,
      persistResumeState,
      preferredFacingMode,
    ],
  );

  const tokenRefresher = useCallback(async () => {
    if (refreshInFlightRef.current) return "";
    refreshInFlightRef.current = true;
    try {
      const { data } = await publicApi.post<VideoTokenResponse>(
        `/public/appointments/${appointmentId}/video-token`,
        {},
      );
      return data.token;
    } finally {
      if (isMountedRef.current) {
        refreshInFlightRef.current = false;
      }
    }
  }, [appointmentId]);

  // Disconnect room if appointment status becomes "ended" (via SSE/polling)
  useEffect(() => {
    if (appointment?.call_status === "ended" && tokenData) {
      setTokenData(null);
      setCallStartedAt(null);
      clearResumeState();
      setJoinError("The consultation has ended.");
    }
  }, [appointment?.call_status, tokenData, clearResumeState]);

  const handleMediaDeviceFailure = useCallback((_failure?: unknown, kind?: string) => {
    const message =
      kind === "audioinput"
        ? "Microphone access failed. You can stay in the call muted."
        : "Camera access failed. You can stay in the call without video.";
    setJoinError(message);
    notifyError("Media access issue", message);
  }, []);

  const handleDisconnect = useCallback((reason?: unknown) => {
    console.log("Disconnected:", reason);
    
    // Convert to string for easy comparison
    const reasonStr = String(reason);
    
    // Ignore transient network issues and let LiveKit's internal auto-reconnect handle it
    if (reasonStr === "network" || reasonStr === "CLIENT_INITIATED_RECONNECT" || reasonStr === "signal_connection_disconnected") {
      return;
    }

    // Only kill the UI for unrecoverable errors (or explicit leaves handled elsewhere)
    if (["server_shutdown", "room_deleted", "user_rejected", "leave", "UNKNOWN_REASON"].some(r => reasonStr.includes(r))) {
        setJoinError("Connection dropped. Rejoin the consultation to continue.");
        setTokenData(null);
        clearResumeAttemptLock();
    }
  }, [clearResumeAttemptLock]);

  const canJoin = Boolean(
    appointment &&
      appointment.mode === "online" &&
      appointment.video_enabled &&
      appointment.status === "confirmed" &&
      appointment.call_status !== "ended",
  );
  const canAttemptJoinNow = Boolean(canJoin && !joinWindow?.tooEarly);

  // Update nowMs periodically for join-window countdown display only
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Auto-join immediately
  const autoJoinAttemptedRef = useRef(false);
  useEffect(() => {
    if (autoJoinAttemptedRef.current || tokenData || joining || !canAttemptJoinNow) return;
    autoJoinAttemptedRef.current = true;
    void joinCall({ audio: true, video: true, facingMode: "user" });
  }, [canAttemptJoinNow, joinCall, joining, tokenData]);

  // ── Loading ───────────────────────────────────────────────────────
  if (!accessReady || appointmentQuery.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#060B14]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-brand/20 blur-2xl" />
          <Loader2 className="relative h-7 w-7 animate-spin text-brand" />
        </div>
        <p className="text-sm text-white/30">Connecting to appointment&hellip;</p>
      </div>
    );
  }

  // ── Error states ─────────────────────────────────────────────────
  if (accessError) {
    return (
      <CallState
        title="This call link is not available"
        description="The appointment could not be loaded from this magic link."
      />
    );
  }

  if (appointmentQuery.isError || !appointment) {
    if (isRateLimitError(appointmentLoadError)) {
      return (
        <CallState
          title="This call page is temporarily rate limited"
          description={`${getRateLimitDescription(appointmentLoadError)} Then reopen the appointment call page.`}
          action={
            <Button className="mt-6 rounded-xl bg-brand text-white hover:bg-brand/90" onClick={() => appointmentQuery.refetch()}>
              Try again
            </Button>
          }
        />
      );
    }
    if (isNetworkError(appointmentLoadError)) {
      return (
        <CallState
          title="We couldn't reach the clinic server"
          description="Check your network connection and try opening the call page again."
          action={
            <Button className="mt-6 rounded-xl bg-brand text-white hover:bg-brand/90" onClick={() => appointmentQuery.refetch()}>
              Try again
            </Button>
          }
        />
      );
    }
    return (
      <CallState
        title="This call link is not available"
        description="The appointment could not be loaded from this magic link."
      />
    );
  }

  if (!canJoin) {
    return (
      <CallState
        title="This appointment is not ready for video"
        description="Only confirmed online appointments with video enabled can join the consultation room."
        action={
          <Button
            className="mt-6 rounded-xl bg-white/10 text-white hover:bg-white/20"
            onClick={() => router.push(`/public/appointments/${appointmentId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to appointment
          </Button>
        }
      />
    );
  }

  if (joinError) {
    return (
      <CallState
        title="Could not join call"
        description={joinError}
        action={
          <div className="mt-6 flex w-full flex-col gap-3 sm:max-w-xs mx-auto">
            <Button className="rounded-xl w-full bg-brand text-white hover:bg-brand/90" onClick={() => {
              joinInFlightRef.current = false;
              void joinCall({ audio: true, video: true, facingMode: "user" });
            }}>
              Try again
            </Button>
            <Button variant="outline" className="rounded-xl w-full border-white/10 bg-white/[0.03] text-white/50 transition-all hover:bg-white/[0.07] hover:text-white/75" onClick={() => {
              joinInFlightRef.current = false;
              void joinCall({ audio: false, video: false });
            }}>
              Join without media
            </Button>
            <Button variant="ghost" className="rounded-xl w-full text-white/25 transition-colors hover:text-white/55" onClick={() => {
              clearResumeState();
              router.push(`/public/appointments/${appointmentId}`);
            }}>
              Back to appointment
            </Button>
          </div>
        }
      />
    );
  }

  if (!tokenData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#060B14]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-brand/20 blur-2xl" />
          <Loader2 className="relative h-7 w-7 animate-spin text-brand" />
        </div>
        <p className="text-sm text-white/30">Entering room&hellip;</p>
      </div>
    );
  }

  // ── Live call ────────────────────────────────────────────────────
  return (
    <LiveKitRoom
      key={appointmentId}
      serverUrl={tokenData.server_url}
      token={tokenData.token}
      connect
      audio={buildPreferredAudioConstraints(mediaPreferences.audio)}
      video={videoOptions}
      options={LIVEKIT_ROOM_OPTIONS}
      onMediaDeviceFailure={handleMediaDeviceFailure}
      className="h-screen"
      onDisconnected={handleDisconnect}
    >
      <LiveCallRoom
        title={appointment.doctor_name || "Doctor consultation"}
        subtitle={format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy - hh:mm a")}
        remoteLabel={appointment.doctor_name || "Doctor"}
        remoteWaitingTitle="Waiting for the doctor"
        remoteWaitingDescription="Stay on this screen. The doctor will appear here as soon as they join the consultation room."
        onLeave={() => {
          clearResumeState();
          router.push(`/public/appointments/${appointmentId}`);
        }}
        onConnected={() => setCallStartedAt(Date.now())}
        tokenRefresher={tokenRefresher}
        endLabel="Leave call"
        infoLabel="Appointment details"
        infoContent={<PatientInfoPanel appointment={appointment} />}
        allowCameraSwitch
        preferredFacingMode={preferredFacingMode}
        onFacingModeChange={setPreferredFacingMode}
        callStartedAt={callStartedAt}
      />
    </LiveKitRoom>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function MediaChip({
  on,
  OnIcon,
  OffIcon,
  onLabel,
  offLabel,
}: {
  on: boolean;
  OnIcon: React.ElementType;
  OffIcon: React.ElementType;
  onLabel: string;
  offLabel: string;
}) {
  const Icon = on ? OnIcon : OffIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-md",
        on ? "bg-white/15 text-white/80" : "bg-black/30 text-white/35",
      )}
    >
      <Icon className="h-3 w-3" />
      {on ? onLabel : offLabel}
    </span>
  );
}

function ToggleRow({
  label,
  sublabel,
  enabled,
  OnIcon,
  OffIcon,
  onToggle,
}: {
  label: string;
  sublabel: string;
  enabled: boolean;
  OnIcon: React.ElementType;
  OffIcon: React.ElementType;
  onToggle: () => void;
}) {
  const Icon = enabled ? OnIcon : OffIcon;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-all",
        enabled ? "border-brand/25 bg-brand/[0.09]" : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05]",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors",
          enabled ? "bg-brand text-white shadow-[0_4px_12px_rgba(88,155,255,0.4)]" : "bg-white/[0.06] text-white/25",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-white/85">{label}</p>
        <p className="text-xs text-white/30">{sublabel}</p>
      </div>
      <span
        className={cn(
          "rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide transition-colors",
          enabled ? "bg-brand/20 text-brand" : "bg-white/[0.05] text-white/20",
        )}
      >
        {enabled ? "ON" : "OFF"}
      </span>
    </button>
  );
}

// ── Patient info panel (shown inside live call) ───────────────────────────────

function PatientInfoPanel({ appointment }: { appointment: PublicAppointment }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Appointment</p>
        <div className="mt-3 space-y-2.5 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="text-white/35">Doctor</span>
            <span className="text-white/75">{appointment.doctor_name || "—"}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-white/35">Date</span>
            <span className="text-white/75">{format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy")}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-white/35">Time</span>
            <span className="text-white/75">{format(parseISO(appointment.scheduled_at), "hh:mm a")}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-white/35">Mode</span>
            <span className="text-white/75">{appointment.mode === "online" ? "Online video" : "Walk-in"}</span>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Tips</p>
        <div className="mt-3 space-y-2.5 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-white/35">Chat</span>
            <span className="text-right text-white/55">Use in-call chat if audio drops or you need to share quick notes.</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-white/35">Camera</span>
            <span className="text-right text-white/55">If your camera is unavailable, you can continue audio-only.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Error / state screen ──────────────────────────────────────────────────────

function CallState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060B14] px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/[0.04] blur-[120px]" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="rounded-[2rem] border border-white/[0.07] bg-white/[0.04] px-8 py-10 text-center backdrop-blur-sm">
          <Image
            src="/images/logo.png"
            alt="eHomeo"
            width={130}
            height={42}
            className="mx-auto h-7 w-auto brightness-[1.75] saturate-0"
          />
          <p className="mt-8 text-lg font-semibold text-white/85">{title}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/35">{description}</p>
          {action}
        </div>
      </motion.div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(PublicCallPageClient), { ssr: false });
