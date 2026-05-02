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
  const autoResumeAttemptedRef = useRef(false);
  const joinInFlightRef = useRef(false);
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

        const prepared = await prepareMediaChoices({
          audio: wantsAudio,
          video: wantsVideo,
          preferredFacingMode: nextFacingMode,
        });

        setMediaPreferences({ audio: prepared.audio, video: prepared.video });
        persistResumeState({ audio: prepared.audio, video: prepared.video }, nextFacingMode);

        if (prepared.warning) notifyInfo("Joining with available devices", prepared.warning);

        const { data } = await publicApi.post<VideoTokenResponse>(
          `/public/appointments/${appointmentId}/video-token`,
          {},
        );
        setTokenData(data);
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
        setJoining(false);
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

  const handleMediaDeviceFailure = useCallback((_failure?: unknown, kind?: string) => {
    const message =
      kind === "audioinput"
        ? "Microphone access failed. You can stay in the call muted."
        : "Camera access failed. You can stay in the call without video.";
    setJoinError(message);
    notifyError("Media access issue", message);
  }, []);

  const handleDisconnect = useCallback(() => {
    setJoinError("Connection dropped. Rejoin the consultation to continue.");
    setTokenData(null);
    clearResumeAttemptLock();
  }, [clearResumeAttemptLock]);

  const canJoin = Boolean(
    appointment &&
      appointment.mode === "online" &&
      appointment.video_enabled &&
      appointment.status === "confirmed",
  );
  const canAttemptJoinNow = Boolean(canJoin && !joinWindow?.tooEarly);

  // Update nowMs periodically for join-window countdown display only
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Auto-resume from sessionStorage if user refreshed mid-call
  useEffect(() => {
    if (autoResumeAttemptedRef.current || tokenData || joining || !canAttemptJoinNow) return;
    if (typeof window === "undefined") return;

    const saved = window.sessionStorage.getItem(resumeStorageKey);
    if (!saved) return;

    const existingResumeLock = Number(window.sessionStorage.getItem(resumeAttemptStorageKey) || 0);
    if (
      Number.isFinite(existingResumeLock) &&
      existingResumeLock > 0 &&
      Date.now() - existingResumeLock < 10_000
    ) return;

    window.sessionStorage.setItem(resumeAttemptStorageKey, String(Date.now()));
    autoResumeAttemptedRef.current = true;

    try {
      const parsed = JSON.parse(saved) as Partial<MediaPreferences> & { facingMode?: CameraFacingMode };
      const nextPreferences = { audio: parsed.audio ?? true, video: parsed.video ?? true };
      setMediaPreferences(nextPreferences);
      const nextFacingMode = parsed.facingMode ?? "user";
      setPreferredFacingMode(nextFacingMode);
      void joinCall({ ...nextPreferences, facingMode: nextFacingMode });
    } catch {
      clearResumeState();
    }
  }, [
    canAttemptJoinNow,
    clearResumeState,
    joinCall,
    joining,
    resumeAttemptStorageKey,
    resumeStorageKey,
    tokenData,
  ]);

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

  // ── Pre-join ─────────────────────────────────────────────────────
  if (!tokenData) {
    return (
      <PatientPreJoinCard
        doctorName={appointment.doctor_name || "Doctor consultation"}
        scheduledAt={appointment.scheduled_at}
        joinError={joinError}
        joining={joining}
        joinLocked={Boolean(joinWindow?.tooEarly)}
        joinWindowMessage={
          joinWindow?.tooEarly
            ? formatEarlyJoinDescription(appointment.scheduled_at, joinWindow.opensAt)
            : null
        }
        mediaPreferences={mediaPreferences}
        preferredFacingMode={preferredFacingMode}
        onToggleAudio={() => setMediaPreferences((p) => ({ ...p, audio: !p.audio }))}
        onToggleVideo={() => setMediaPreferences((p) => ({ ...p, video: !p.video }))}
        onToggleFacingMode={() =>
          setPreferredFacingMode((p) => (p === "user" ? "environment" : "user"))
        }
        onJoin={() => void joinCall()}
        onJoinWithoutMedia={() => void joinCall({ audio: false, video: false })}
        onBack={() => {
          clearResumeState();
          router.push(`/public/appointments/${appointmentId}`);
        }}
      />
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
        tokenRefresher={async () => {
          const { data } = await publicApi.post<VideoTokenResponse>(
            `/public/appointments/${appointmentId}/video-token`,
            {},
          );
          setTokenData(data);
          return data.token;
        }}
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

// ── Pre-join card ─────────────────────────────────────────────────────────────

function PatientPreJoinCard({
  doctorName,
  scheduledAt,
  joinError,
  joining,
  joinLocked,
  joinWindowMessage,
  mediaPreferences,
  preferredFacingMode,
  onToggleAudio,
  onToggleVideo,
  onToggleFacingMode,
  onJoin,
  onJoinWithoutMedia,
  onBack,
}: {
  doctorName: string;
  scheduledAt: string;
  joinError: string | null;
  joining: boolean;
  joinLocked: boolean;
  joinWindowMessage: string | null;
  mediaPreferences: MediaPreferences;
  preferredFacingMode: CameraFacingMode;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleFacingMode: () => void;
  onJoin: () => void;
  onJoinWithoutMedia: () => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function startPreview() {
      if (!mediaPreferences.video) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: preferredFacingMode, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch { /* preview is best-effort */ }
    }
    void startPreview();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [mediaPreferences.video, preferredFacingMode]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#060B14] px-4 py-8">
      {/* Ambient brand glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/[0.045] blur-[130px]" />
        <div className="absolute right-0 top-0 h-[300px] w-[300px] rounded-full bg-brand-accent/[0.03] blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-4xl"
      >
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          {/* ── Camera preview ── */}
          <section className="relative overflow-hidden rounded-[2rem] bg-[#0C1018] ring-1 ring-white/[0.05]">
            <div className="relative aspect-[4/3] w-full lg:aspect-auto lg:h-full lg:min-h-[500px]">
              {mediaPreferences.video ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                  style={{ transform: preferredFacingMode === "user" ? "scaleX(-1)" : undefined }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/[0.06]">
                      <User className="h-9 w-9 text-white/15" />
                    </div>
                    <p className="mt-3 text-sm text-white/20">Camera is off</p>
                  </div>
                </div>
              )}

              {/* Bottom overlay */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pb-5 pt-14">
                <p className="text-base font-semibold text-white/90">{doctorName}</p>
                <p className="mt-0.5 text-sm text-white/40">
                  {format(parseISO(scheduledAt), "EEE, dd MMM yyyy · hh:mm a")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <MediaChip
                    on={mediaPreferences.video}
                    OnIcon={Camera}
                    OffIcon={CameraOff}
                    onLabel="Camera on"
                    offLabel="Camera off"
                  />
                  <MediaChip
                    on={mediaPreferences.audio}
                    OnIcon={Mic}
                    OffIcon={MicOff}
                    onLabel="Mic on"
                    offLabel="Muted"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── Setup panel ── */}
          <section className="flex flex-col rounded-[2rem] border border-white/[0.07] bg-white/[0.03] p-6 backdrop-blur-sm sm:p-7">
            <Image
              src="/images/logo.png"
              alt="eHomeo"
              width={120}
              height={38}
              className="h-6 w-auto brightness-[1.75] saturate-0"
            />

            <h1 className="mt-5 text-2xl font-bold tracking-tight text-white/90">Join consultation</h1>
            <p className="mt-1 text-sm text-white/35">
              {format(parseISO(scheduledAt), "EEE, dd MMM yyyy · hh:mm a")}
            </p>

            {/* Media toggles */}
            <div className="mt-6 space-y-2.5">
              <ToggleRow
                label="Camera"
                sublabel={mediaPreferences.video ? "Joining with video" : "Joining without camera"}
                enabled={mediaPreferences.video}
                OnIcon={Camera}
                OffIcon={CameraOff}
                onToggle={onToggleVideo}
              />
              <ToggleRow
                label="Microphone"
                sublabel={mediaPreferences.audio ? "Joining with audio" : "Joining muted"}
                enabled={mediaPreferences.audio}
                OnIcon={Mic}
                OffIcon={MicOff}
                onToggle={onToggleAudio}
              />
            </div>

            {/* Camera mode */}
            {mediaPreferences.video && (
              <div className="mt-2.5 flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                <div>
                  <p className="text-sm font-medium text-white/80">Camera mode</p>
                  <p className="text-xs text-white/30">{getFacingModeLabel(preferredFacingMode)}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-white/15 bg-white/[0.05] text-white/60 hover:bg-white/10 hover:text-white/85"
                  onClick={onToggleFacingMode}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {preferredFacingMode === "user" ? "Use back" : "Use front"}
                </Button>
              </div>
            )}

            {/* Error notice */}
            {joinError && !joinLocked && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/[0.07] p-4 text-sm">
                <p className="font-semibold text-red-400">Could not start media</p>
                <p className="mt-1 leading-relaxed text-red-400/70">{joinError}</p>
              </div>
            )}

            {/* Too-early notice */}
            {joinLocked && joinWindowMessage && (
              <div className="mt-4 rounded-2xl border border-brand/20 bg-brand/[0.07] p-4 text-sm">
                <p className="font-semibold text-brand/90">Call not open yet</p>
                <p className="mt-1 leading-relaxed text-white/35">{joinWindowMessage}</p>
              </div>
            )}

            {/* CTAs */}
            <div className="mt-auto space-y-2.5 pt-6">
              <Button
                className="h-12 w-full rounded-2xl bg-brand-accent text-sm font-semibold text-brand-dark shadow-[0_8px_32px_rgba(216,238,83,0.18)] transition-all hover:-translate-y-px hover:bg-[#d0e64b] hover:shadow-[0_14px_40px_rgba(216,238,83,0.26)] disabled:opacity-60"
                loading={joining}
                disabled={joinLocked}
                onClick={onJoin}
              >
                <Video className="h-4 w-4" />
                {joinLocked ? "Join unavailable" : "Join now"}
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full rounded-2xl border-white/10 bg-white/[0.03] text-sm text-white/50 transition-all hover:bg-white/[0.07] hover:text-white/75 disabled:opacity-40"
                disabled={joining || joinLocked}
                onClick={onJoinWithoutMedia}
              >
                <Phone className="h-4 w-4" />
                Join without media
              </Button>
            </div>

            <button
              type="button"
              className="mt-5 inline-flex items-center gap-1.5 text-sm text-white/25 transition-colors hover:text-white/55"
              onClick={onBack}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to appointment
            </button>
          </section>
        </div>
      </motion.div>
    </div>
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
