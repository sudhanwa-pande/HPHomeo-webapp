"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { ArrowLeft, Camera, CameraOff, Loader2, Mic, MicOff, Phone, RefreshCw, User, Video } from "lucide-react";
import { format, parseISO } from "date-fns";

import api, { getApiError, getRateLimitDescription, isNetworkError, isRateLimitError } from "@/lib/api";
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
import { useEventStream } from "@/hooks/use-event-stream";
import { LiveCallRoom } from "@/components/call/live-call-room";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import type { PatientAppointment, PatientAppointmentsResponse } from "@/types/patient";
import type { VideoTokenResponse } from "@/types/doctor";

type MediaPreferences = { audio: boolean; video: boolean };

// Imperative handle exposed by the pre-join card so the parent can release
// the preview MediaStream's tracks BEFORE <LiveKitRoom> mounts. Avoids the
// "device in use" race where LiveKit tries to acquire camera/mic before
// React has run the card's unmount cleanup.
type PreJoinHandle = {
  releasePreview: () => void;
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

function PatientCallContent() {
  const params = useParams<{ appointmentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const appointmentId = params.appointmentId;
  const joinInFlightRef = useRef(false);
  const autoResumeAttemptedRef = useRef(false);
  // Lets us imperatively release the pre-join preview's MediaStream tracks
  // immediately before mounting <LiveKitRoom> — see PreJoinHandle docstring.
  const preJoinRef = useRef<PreJoinHandle>(null);
  const autoJoin = searchParams.get("autoJoin") === "1";
  const resumeStorageKey = `ehomeo:patient-auth-call:${appointmentId}`;
  const resumeAttemptStorageKey = `${resumeStorageKey}:resume-lock`;

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

  // Safety net: stop all camera/mic tracks when this page unmounts (navigation away)
  // LiveKitRoom should handle this, but some browsers hold tracks if cleanup races
  useEffect(() => {
    return () => {
      navigator.mediaDevices
        .enumerateDevices()
        .then(() => {
          // Access any lingering tracks via the document's media elements
          document.querySelectorAll("video, audio").forEach((el) => {
            const media = el as HTMLMediaElement;
            if (media.srcObject instanceof MediaStream) {
              media.srcObject.getTracks().forEach((t) => t.stop());
              media.srcObject = null;
            }
          });
        })
        .catch(() => {});
    };
  }, []);

  const videoOptions = useMemo(
    () => buildPreferredVideoConstraints(mediaPreferences.video, preferredFacingMode),
    [mediaPreferences.video, preferredFacingMode],
  );

  // Fetch appointment via authenticated API
  // SSE delivers instant updates; 30s poll is a safety net in case SSE drops
  const appointmentQuery = useQuery({
    queryKey: ["patient", "appointment", appointmentId, "call"],
    queryFn: async () => {
      const { data } = await api.get<PatientAppointmentsResponse>("/patient/appointments", {
        params: { limit: 100 },
      });
      return data.items.find((a) => a.appointment_id === appointmentId) || null;
    },
    enabled: Boolean(appointmentId),
    retry: false,
    refetchInterval: 30_000,
  });

  const appointment = appointmentQuery.data;
  const joinWindow = useMemo(
    () => (appointment ? getPatientJoinWindow(appointment.scheduled_at, nowMs) : null),
    [appointment, nowMs],
  );

  // SSE: real-time updates
  useEventStream({
    path: "/patient/events/stream",
    onEvent: {
      call_state_changed: () => {
        queryClient.invalidateQueries({ queryKey: ["patient", "appointment", appointmentId, "call"] });
      },
      appointment_completed: () => {
        queryClient.invalidateQueries({ queryKey: ["patient", "appointment", appointmentId, "call"] });
      },
      appointment_no_show: () => {
        queryClient.invalidateQueries({ queryKey: ["patient", "appointment", appointmentId, "call"] });
      },
    },
    onReconnect: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", "appointment", appointmentId, "call"] });
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
          const msg = formatEarlyJoinDescription(appointment.scheduled_at, joinWindow.opensAt);
          setJoinError(msg);
          notifyInfo("Call not open yet", msg);
          return;
        }

        const prepared = await prepareMediaChoices({ audio: wantsAudio, video: wantsVideo, preferredFacingMode: nextFacingMode });
        setMediaPreferences({ audio: prepared.audio, video: prepared.video });
        persistResumeState({ audio: prepared.audio, video: prepared.video }, nextFacingMode);

        if (prepared.warning) notifyInfo("Joining with available devices", prepared.warning);

        // Use authenticated patient video-token endpoint
        const { data } = await api.post<VideoTokenResponse>(
          `/patient/appointments/${appointmentId}/video-token`,
          {},
        );
        // Release the preview's camera/mic before <LiveKitRoom> mounts and
        // tries to re-acquire them. 200 ms covers Chrome/Safari device-release
        // latency so LiveKit's getUserMedia doesn't see a still-locked device.
        preJoinRef.current?.releasePreview();
        await new Promise((resolve) => setTimeout(resolve, 200));
        setTokenData(data);
        // callStartedAt is set via onConnected when the room actually connects.
      } catch (error) {
        const apiMessage = getApiError(error);
        if (apiMessage !== "An unexpected error occurred.") {
          const nextMessage =
            apiMessage.includes("You can join") && appointment?.scheduled_at
              ? formatEarlyJoinDescription(
                  appointment.scheduled_at,
                  joinWindow?.opensAt ?? new Date(parseISO(appointment.scheduled_at).getTime() - PATIENT_VIDEO_JOIN_EARLY_MINUTES * 60 * 1000),
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
        if (error instanceof Error && ["NotAllowedError", "NotFoundError", "NotReadableError", "AbortError"].includes(error.name)) {
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
    [appointment, appointmentId, clearResumeAttemptLock, joinWindow, mediaPreferences.audio, mediaPreferences.video, persistResumeState, preferredFacingMode],
  );

  const handleMediaDeviceFailure = useCallback((_failure?: unknown, kind?: string) => {
    const message = kind === "audioinput"
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
    appointment && appointment.mode === "online" && appointment.video_enabled && appointment.status === "confirmed",
  );
  const canAttemptJoinNow = Boolean(canJoin && !joinWindow?.tooEarly);

  // Clock for join-window countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Auto-resume if returning to page
  useEffect(() => {
    if (autoResumeAttemptedRef.current || tokenData || joining || !canAttemptJoinNow) return;
    if (typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem(resumeStorageKey);
    if (!saved) return;
    const lock = Number(window.sessionStorage.getItem(resumeAttemptStorageKey) || 0);
    if (Number.isFinite(lock) && lock > 0 && Date.now() - lock < 10_000) return;
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
  }, [canAttemptJoinNow, clearResumeState, joinCall, joining, resumeAttemptStorageKey, resumeStorageKey, tokenData]);

  // Auto-join when arriving from waiting room (skips pre-join screen)
  const autoJoinAttemptedRef = useRef(false);
  useEffect(() => {
    if (!autoJoin || autoJoinAttemptedRef.current || tokenData || joining || !canAttemptJoinNow) return;
    autoJoinAttemptedRef.current = true;
    void joinCall();
  }, [autoJoin, canAttemptJoinNow, joinCall, joining, tokenData]);

  if (appointmentQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-dark">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (appointmentQuery.isError || !appointment) {
    if (isRateLimitError(appointmentQuery.error)) {
      return (
        <CallState
          title="Temporarily rate limited"
          description={`${getRateLimitDescription(appointmentQuery.error)} Then try again.`}
          action={<Button className="mt-6 rounded-xl" onClick={() => appointmentQuery.refetch()}>Try again</Button>}
        />
      );
    }
    if (isNetworkError(appointmentQuery.error)) {
      return (
        <CallState
          title="Couldn't reach the server"
          description="Check your network connection and try again."
          action={<Button className="mt-6 rounded-xl" onClick={() => appointmentQuery.refetch()}>Try again</Button>}
        />
      );
    }
    return <CallState title="Appointment not found" description="This appointment could not be loaded." />;
  }

  if (!canJoin) {
    return (
      <CallState
        title="This appointment is not ready for video"
        description="Only confirmed online appointments with video enabled can join."
        action={
          <Button className="mt-6 rounded-xl" onClick={() => router.push(`/patient/appointments/${appointmentId}`)}>
            <ArrowLeft className="h-4 w-4" /> Back to appointment
          </Button>
        }
      />
    );
  }

  if (!tokenData) {
    return (
      <PatientPreJoinScreen
        ref={preJoinRef}
        doctorName={appointment.doctor_name}
        scheduledAt={appointment.scheduled_at}
        mediaPreferences={mediaPreferences}
        preferredFacingMode={preferredFacingMode}
        joinError={joinError}
        joining={joining}
        joinLocked={Boolean(joinWindow?.tooEarly)}
        joinWindowMessage={joinWindow?.tooEarly ? formatEarlyJoinDescription(appointment.scheduled_at, joinWindow.opensAt) : null}
        onToggleVideo={() => setMediaPreferences((c) => ({ ...c, video: !c.video }))}
        onToggleAudio={() => setMediaPreferences((c) => ({ ...c, audio: !c.audio }))}
        onToggleFacingMode={() => setPreferredFacingMode((c) => (c === "user" ? "environment" : "user"))}
        onJoin={() => void joinCall()}
        onJoinWithoutMedia={() => void joinCall({ audio: false, video: false })}
        onBack={() => { clearResumeState(); router.push(`/patient/appointments/${appointmentId}`); }}
      />
    );
  }

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
        title={appointment.doctor_name}
        subtitle={format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy - hh:mm a")}
        remoteLabel={appointment.doctor_name}
        remoteWaitingTitle="Waiting for the doctor"
        remoteWaitingDescription="Stay on this screen. The doctor will appear as soon as they join."
        onLeave={() => { clearResumeState(); router.push(`/patient/appointments/${appointmentId}`); }}
        onConnected={() => setCallStartedAt(Date.now())}
        tokenRefresher={async () => {
          const { data } = await api.post<VideoTokenResponse>(
            `/patient/appointments/${appointmentId}/video-token`,
            {},
          );
          setTokenData(data);
          return data.token;
        }}
        endLabel="Leave call"
        infoLabel="Appointment details"
        infoContent={
          <div className="space-y-3 rounded-xl bg-white/6 p-4 text-sm text-white">
            <div className="flex justify-between"><span className="text-white/45">Doctor</span><span className="text-white/85">{appointment.doctor_name}</span></div>
            <div className="flex justify-between"><span className="text-white/45">Date</span><span className="text-white/85">{format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy")}</span></div>
            <div className="flex justify-between"><span className="text-white/45">Time</span><span className="text-white/85">{format(parseISO(appointment.scheduled_at), "hh:mm a")}</span></div>
          </div>
        }
        allowCameraSwitch
        preferredFacingMode={preferredFacingMode}
        onFacingModeChange={setPreferredFacingMode}
        callStartedAt={callStartedAt}
      />
    </LiveKitRoom>
  );
}

type PatientPreJoinScreenProps = {
  doctorName: string;
  scheduledAt: string;
  mediaPreferences: { audio: boolean; video: boolean };
  preferredFacingMode: CameraFacingMode;
  joinError: string | null;
  joining: boolean;
  joinLocked: boolean;
  joinWindowMessage: string | null;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
  onToggleFacingMode: () => void;
  onJoin: () => void;
  onJoinWithoutMedia: () => void;
  onBack: () => void;
};

const PatientPreJoinScreen = forwardRef<PreJoinHandle, PatientPreJoinScreenProps>(function PatientPreJoinScreen({
  doctorName,
  scheduledAt,
  mediaPreferences,
  preferredFacingMode,
  joinError,
  joining,
  joinLocked,
  joinWindowMessage,
  onToggleVideo,
  onToggleAudio,
  onToggleFacingMode,
  onJoin,
  onJoinWithoutMedia,
  onBack,
}, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Imperative `releasePreview` so the parent can stop the camera/mic before
  // <LiveKitRoom> mounts and tries to acquire the same devices.
  useImperativeHandle(ref, () => ({
    releasePreview: () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    },
  }), []);

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
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    };
  }, [mediaPreferences.video, preferredFacingMode]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4 py-6">
      <div className="w-full max-w-4xl">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Live preview */}
          <section className="relative overflow-hidden rounded-3xl bg-gray-900">
            <div className="relative aspect-[4/3] w-full lg:aspect-auto lg:h-full lg:min-h-[440px]">
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
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
                  <div className="text-center">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.06]">
                      <User className="h-10 w-10 text-white/20" />
                    </div>
                    <p className="mt-3 text-sm text-white/30">Camera is off</p>
                  </div>
                </div>
              )}
              {/* Overlay badges */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-4 pb-4 pt-10">
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-md ${mediaPreferences.video ? "bg-white/20 text-white/90" : "bg-black/30 text-white/50"}`}>
                    {mediaPreferences.video ? <Camera className="h-3 w-3" /> : <CameraOff className="h-3 w-3" />}
                    {mediaPreferences.video ? "Camera on" : "Camera off"}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-md ${mediaPreferences.audio ? "bg-white/20 text-white/90" : "bg-black/30 text-white/50"}`}>
                    {mediaPreferences.audio ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                    {mediaPreferences.audio ? "Mic on" : "Muted"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Setup panel */}
          <section className="rounded-3xl border border-gray-200/80 bg-white p-6 shadow-sm sm:p-7">
            <Image src="/images/logo.png" alt="hpHomeo" width={130} height={42} className="h-7 w-auto" />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-gray-900">Join consultation</h1>
            <p className="mt-1 text-sm text-gray-500">
              {doctorName} &middot; {format(parseISO(scheduledAt), "EEE, dd MMM yyyy - hh:mm a")}
            </p>

            <div className="mt-6 grid gap-2.5">
              <button type="button" onClick={onToggleVideo} className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${mediaPreferences.video ? "border-brand/20 bg-brand/[0.06]" : "border-gray-200 bg-gray-50"}`}>
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${mediaPreferences.video ? "bg-brand text-white" : "bg-gray-200 text-gray-500"}`}>
                  {mediaPreferences.video ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Camera</p>
                  <p className="text-xs text-gray-500">{mediaPreferences.video ? "Joining with video" : "Joining without camera"}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${mediaPreferences.video ? "bg-brand/15 text-brand" : "bg-gray-200 text-gray-500"}`}>{mediaPreferences.video ? "ON" : "OFF"}</span>
              </button>

              <button type="button" onClick={onToggleAudio} className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${mediaPreferences.audio ? "border-brand/20 bg-brand/[0.06]" : "border-gray-200 bg-gray-50"}`}>
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${mediaPreferences.audio ? "bg-brand text-white" : "bg-gray-200 text-gray-500"}`}>
                  {mediaPreferences.audio ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Microphone</p>
                  <p className="text-xs text-gray-500">{mediaPreferences.audio ? "Joining with audio" : "Joining muted"}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${mediaPreferences.audio ? "bg-brand/15 text-brand" : "bg-gray-200 text-gray-500"}`}>{mediaPreferences.audio ? "ON" : "OFF"}</span>
              </button>
            </div>

            {mediaPreferences.video && (
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-3.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">Camera mode</p>
                  <p className="text-xs text-gray-500">{getFacingModeLabel(preferredFacingMode)}</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-full border-gray-300" onClick={onToggleFacingMode}>
                  <RefreshCw className="h-3.5 w-3.5" /> Switch
                </Button>
              </div>
            )}

            {joinError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
                <p className="font-medium text-red-800">Issue</p>
                <p className="mt-1 leading-relaxed text-red-600">{joinError}</p>
              </div>
            )}

            {joinLocked && joinWindowMessage && (
              <div className="mt-4 rounded-2xl border border-brand/15 bg-brand/[0.04] p-4 text-sm">
                <p className="font-medium text-brand-dark">Call not open yet</p>
                <p className="mt-1 leading-relaxed text-gray-500">{joinWindowMessage}</p>
              </div>
            )}

            <div className="mt-6 grid gap-2.5">
              <Button className="h-12 w-full rounded-2xl bg-brand text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(88,155,255,0.4)] hover:bg-brand/90" loading={joining} disabled={joinLocked} onClick={onJoin}>
                <Video className="h-4 w-4" /> {joinLocked ? "Join unavailable" : "Join now"}
              </Button>
              <Button variant="outline" className="h-11 w-full rounded-2xl border-gray-200 text-sm" disabled={joining || joinLocked} onClick={onJoinWithoutMedia}>
                <Phone className="h-4 w-4" /> Join without media
              </Button>
            </div>

            <button type="button" className="mt-4 inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-gray-600" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          </section>
        </div>
      </div>
    </div>
  );
});

function CallState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-6">
      <div className="w-full max-w-lg rounded-3xl border border-gray-200/80 bg-white px-8 py-10 text-center shadow-sm">
        <Image src="/images/logo.png" alt="hpHomeo" width={130} height={42} className="mx-auto h-7 w-auto" />
        <p className="mt-6 text-lg font-semibold text-gray-900">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">{description}</p>
        {action}
      </div>
    </div>
  );
}

function PatientCallPage() {
  return (
    <AuthGuard role="patient">
      <PatientCallContent />
    </AuthGuard>
  );
}

export default dynamic(() => Promise.resolve(PatientCallPage), { ssr: false });
