"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { ArrowLeft, Camera, CameraOff, CheckCircle2, CircleAlert, Loader2, Mic, MicOff, Phone, PhoneOff, User, Video } from "lucide-react";
import { format, parseISO } from "date-fns";

import api from "@/lib/api";
import {
  buildPreferredVideoConstraints,
  buildPreferredAudioConstraints,
  getMediaDeviceErrorMessage,
  LIVEKIT_ROOM_OPTIONS,
  prepareMediaChoices,
} from "@/lib/media";
import { notifyApiError, notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import { useEventStream } from "@/hooks/use-event-stream";
import { AuthGuard } from "@/components/auth-guard";
import { LiveCallRoom } from "@/components/call/live-call-room";
import { Button } from "@/components/ui/button";
import type { DoctorAppointment } from "@/types/doctor";

interface VideoTokenResponse {
  provider: string;
  server_url: string;
  room: string;
  token: string;
}

type MediaPreferences = {
  audio: boolean;
  video: boolean;
};

// Imperative handle exposed by the pre-join card so the parent can release
// the preview MediaStream's tracks BEFORE <LiveKitRoom> mounts. Avoids the
// "device in use" race where LiveKit tries to acquire camera/mic before
// React has run the card's unmount cleanup.
type PreJoinHandle = {
  releasePreview: () => void;
};

export default function CallRoomPage() {
  return (
    <AuthGuard role="doctor">
      <CallRoomContent />
    </AuthGuard>
  );
}

function CallRoomContent() {
  const router = useRouter();
  const params = useParams();
  const appointmentId = params.appointmentId as string;
  const queryClient = useQueryClient();
  const autoResumeAttemptedRef = useRef(false);
  const joinInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  // Lets us imperatively release the pre-join preview's MediaStream tracks
  // immediately before mounting <LiveKitRoom> — see PreJoinHandle docstring.
  const preJoinRef = useRef<PreJoinHandle>(null);
  const resumeStorageKey = `ehomeo:doctor-call:${appointmentId}`;
  const resumeAttemptStorageKey = `${resumeStorageKey}:resume-lock`;

  const [tokenData, setTokenData] = useState<VideoTokenResponse | null>(null);
  const [joining, setJoining] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [mediaPreferences, setMediaPreferences] = useState<MediaPreferences>({
    audio: true,
    video: true,
  });

  // Safety net: stop all camera/mic tracks when this page unmounts (navigation away)
  // LiveKitRoom should handle this, but some browsers hold tracks if cleanup races
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

  // SSE for real-time call status updates. This page is standalone (not inside
  // DoctorShell), so it needs its own SSE connection.
  useEventStream({
    path: "/doctor/events/stream",
    onEvent: {
      call_state_changed: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-appointment-detail", appointmentId] });
      },
      patient_waiting: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-appointment-detail", appointmentId] });
      },
      appointment_completed: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-appointment-detail", appointmentId] });
      },
      appointment_no_show: () => {
        queryClient.invalidateQueries({ queryKey: ["doctor-appointment-detail", appointmentId] });
      },
    },
    onReconnect: () => {
      queryClient.invalidateQueries({ queryKey: ["doctor-appointment-detail", appointmentId] });
    },
  });

  const clearResumeState = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.removeItem(resumeStorageKey);
    window.sessionStorage.removeItem(resumeAttemptStorageKey);
  }, [resumeAttemptStorageKey, resumeStorageKey]);
  const clearResumeAttemptLock = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.removeItem(resumeAttemptStorageKey);
  }, [resumeAttemptStorageKey]);
  const persistResumeState = useCallback(
    (preferences: MediaPreferences) => {
      if (typeof window === "undefined") {
        return;
      }

      window.sessionStorage.setItem(
        resumeStorageKey,
        JSON.stringify(preferences),
      );
    },
    [resumeStorageKey],
  );
  const handleMediaDeviceFailure = useCallback(
    (_failure?: unknown, kind?: string) => {
      const message =
        kind === "audioinput"
          ? "Microphone access failed. You can stay in the call muted."
          : "Camera access failed. You can stay in the call without video.";
      setJoinError(message);
      notifyError("Media access issue", message);
    },
    [],
  );
  const handleDisconnected = useCallback((reason?: unknown) => {
    // Ignore disconnects that are part of the normal end-call flow
    if (callEnded) return;

    console.log("Disconnected:", reason);
    const reasonStr = String(reason);

    // Ignore transient network issues and let LiveKit's internal auto-reconnect handle it
    if (reasonStr === "network" || reasonStr === "CLIENT_INITIATED_RECONNECT" || reasonStr === "signal_connection_disconnected") {
      return;
    }

    if (["server_shutdown", "room_deleted", "user_rejected", "leave", "UNKNOWN_REASON"].some(r => reasonStr.includes(r))) {
        setJoinError("Connection dropped. Rejoin the consultation to continue.");
        setTokenData(null);
        setCallStartedAt(null);
        clearResumeAttemptLock();
    }
  }, [callEnded, clearResumeAttemptLock]);

  const { data: appointment, isLoading: appointmentLoading } = useQuery({
    queryKey: ["doctor-appointment-detail", appointmentId],
    queryFn: async () => {
      const { data } = await api.get<DoctorAppointment>(`/doctor/appointments/${appointmentId}`);
      return data;
    },
  });

  // Polling fallback to detect status drift
  useEffect(() => {
    if (!tokenData) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["doctor-appointment-detail", appointmentId] });
    }, 15000);
    return () => clearInterval(interval);
  }, [appointmentId, tokenData, queryClient]);

  const joinCall = useCallback(
    async (options?: Partial<MediaPreferences>) => {
      if (joinInFlightRef.current) {
        return;
      }

      const wantsAudio = options?.audio ?? mediaPreferences.audio;
      const wantsVideo = options?.video ?? mediaPreferences.video;

      joinInFlightRef.current = true;
      setJoining(true);
      setJoinError(null);

      try {
        const prepared = await prepareMediaChoices({
          audio: wantsAudio,
          video: wantsVideo,
        });

        setMediaPreferences({
          audio: prepared.audio,
          video: prepared.video,
        });
        persistResumeState({
          audio: prepared.audio,
          video: prepared.video,
        });

        if (prepared.warning) {
          notifyInfo("Joining with available devices", prepared.warning);
        }

        const { data } = await api.post<VideoTokenResponse>(`/doctor/appointments/${appointmentId}/video-token`);
        // Release the preview's camera/mic before <LiveKitRoom> mounts and
        // tries to re-acquire them. 200 ms covers Chrome/Safari device-release
        // latency so LiveKit's getUserMedia doesn't see a still-locked device.
        preJoinRef.current?.releasePreview();
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        if (isMountedRef.current) {
          setTokenData(data);
        }
        // callStartedAt is set via onConnected when the room actually connects,
        // not here — avoids counting ICE/DTLS negotiation time in the call timer.
      } catch (error) {
        const message = getMediaDeviceErrorMessage(error);
        setJoinError(message);

        if (error instanceof Error && ["NotAllowedError", "NotFoundError", "NotReadableError", "AbortError"].includes(error.name)) {
          notifyError("Couldn't start media", message);
        } else {
          notifyApiError(error, "Couldn't start call");
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
      appointmentId,
      clearResumeAttemptLock,
      mediaPreferences.audio,
      mediaPreferences.video,
      persistResumeState,
    ],
  );

  const tokenRefresher = useCallback(async () => {
    if (refreshInFlightRef.current) return "";
    refreshInFlightRef.current = true;
    try {
      const { data } = await api.post<VideoTokenResponse>(`/doctor/appointments/${appointmentId}/video-token`);
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
      setCallEnded(true);
      setTokenData(null);
      setCallStartedAt(null);
      clearResumeState();
    }
  }, [appointment?.call_status, tokenData, clearResumeState]);

  const endCallMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/doctor/appointments/${appointmentId}/call/end`);
    },
    onSuccess: () => {
      notifySuccess("Call ended", "The consultation session has been closed.");
      clearResumeState();
      setCallEnded(true);
      setTokenData(null);
      setCallStartedAt(null);
      queryClient.invalidateQueries({ queryKey: ["doctor-waiting"] });
      queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] });
    },
    onError: (error) => notifyApiError(error, "Couldn't end call"),
  });

  useEffect(() => {
    if (
      autoResumeAttemptedRef.current ||
      tokenData ||
      joining ||
      callEnded ||
      !appointment ||
      appointment.mode !== "online" ||
      !appointment.video_enabled ||
      appointment.status !== "confirmed"
    ) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const saved = window.sessionStorage.getItem(resumeStorageKey);
    if (!saved) {
      return;
    }

    const existingResumeLock = Number(
      window.sessionStorage.getItem(resumeAttemptStorageKey) || 0,
    );
    if (
      Number.isFinite(existingResumeLock) &&
      existingResumeLock > 0 &&
      Date.now() - existingResumeLock < 10_000
    ) {
      return;
    }

    window.sessionStorage.setItem(
      resumeAttemptStorageKey,
      String(Date.now()),
    );
    autoResumeAttemptedRef.current = true;

    try {
      const parsed = JSON.parse(saved) as Partial<MediaPreferences>;
      const nextPreferences = {
        audio: parsed.audio ?? true,
        video: parsed.video ?? true,
      };
      setMediaPreferences(nextPreferences);
      void joinCall(nextPreferences);
    } catch {
      clearResumeState();
    }
  }, [
    appointment,
    callEnded,
    clearResumeState,
    joinCall,
    joining,
    resumeAttemptStorageKey,
    resumeStorageKey,
    tokenData,
  ]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/doctor/appointments/${appointmentId}/complete`);
    },
    onSuccess: () => {
      notifySuccess("Appointment completed", "The consultation has been marked as completed.");
      queryClient.invalidateQueries({ queryKey: ["doctor-stats"] });
    },
    onError: (error) => notifyApiError(error, "Couldn't complete appointment"),
  });

  if (appointmentLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-dark">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  const canStartCall =
    appointment &&
    appointment.mode === "online" &&
    appointment.video_enabled &&
    appointment.status === "confirmed";

  if (callEnded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111113] px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/[0.06] bg-[#161618] p-8 text-center text-white">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <PhoneOff className="h-7 w-7 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Call ended</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/45">
            {appointment?.patient?.full_name
              ? `The consultation with ${appointment.patient.full_name} has finished.`
              : "The consultation has finished."}
          </p>

          <div className="mt-8 space-y-2.5">
            {appointment?.status === "confirmed" ? (
              <Button
                className="h-11 w-full rounded-2xl bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-400"
                loading={completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark appointment completed
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="h-11 w-full rounded-2xl border-white/[0.08] bg-transparent text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
              onClick={() => router.push(`/doctor/appointments/${appointmentId}`)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to appointments
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!canStartCall) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111113] px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/[0.06] bg-[#161618] p-8 text-center text-white">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <CircleAlert className="h-6 w-6 text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold">This call is not available</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/45">
            {appointment?.status === "completed"
              ? "This consultation has already been completed and can no longer be joined."
              : "Only confirmed online appointments with video enabled can be joined from the dashboard."}
          </p>
          <Button
            variant="outline"
            className="mt-6 h-11 w-full rounded-2xl border-white/[0.08] bg-transparent text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
            onClick={() => router.push(`/doctor/appointments/${appointmentId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to appointments
          </Button>
        </div>
      </div>
    );
  }

  if (!tokenData) {
    return (
      <PreJoinCard
        ref={preJoinRef}
        title={appointment?.patient?.full_name ?? "Video consultation"}
        subtitle={
          appointment ? format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy - hh:mm a") : ""
        }
        callStatus={appointment?.call_status}
        joinError={joinError}
        joining={joining}
        mediaPreferences={mediaPreferences}
        onToggleAudio={() => setMediaPreferences((current) => ({ ...current, audio: !current.audio }))}
        onToggleVideo={() => setMediaPreferences((current) => ({ ...current, video: !current.video }))}
        onJoin={() => void joinCall()}
        onJoinWithoutMedia={() => void joinCall({ audio: false, video: false })}
        onBack={() => {
          clearResumeState();
          router.push(`/doctor/appointments/${appointmentId}`);
        }}
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
      video={buildPreferredVideoConstraints(mediaPreferences.video)}
      options={LIVEKIT_ROOM_OPTIONS}
      onMediaDeviceFailure={handleMediaDeviceFailure}
      onDisconnected={handleDisconnected}
      className="h-screen"
    >
      <LiveCallRoom
        title={appointment?.patient?.full_name ?? "Video consultation"}
        subtitle={appointment ? format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy - hh:mm a") : "Consultation"}
        remoteLabel={appointment?.patient?.full_name ?? "Patient"}
        remoteWaitingTitle={appointment?.patient?.full_name ? `Waiting for ${appointment.patient.full_name}` : "Waiting for patient"}
        remoteWaitingDescription="The patient will appear here when they join the consultation room."
        onBack={() => router.push(`/doctor/appointments/${appointmentId}`)}
        onLeave={() => endCallMutation.mutate()}
        onConnected={() => setCallStartedAt(Date.now())}
        tokenRefresher={tokenRefresher}
        endLoading={endCallMutation.isPending}
        endLabel="End consultation"
        allowScreenShare
        callStartedAt={callStartedAt}
        infoLabel="Patient details"
        infoContent={appointment ? <DoctorInfoPanel appointment={appointment} /> : null}
      />
    </LiveKitRoom>
  );
}

type PreJoinCardProps = {
  title: string;
  subtitle: string;
  callStatus?: string;
  joinError: string | null;
  joining: boolean;
  mediaPreferences: MediaPreferences;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onJoin: () => void;
  onJoinWithoutMedia: () => void;
  onBack: () => void;
};

const PreJoinCard = forwardRef<PreJoinHandle, PreJoinCardProps>(function PreJoinCard({
  title,
  subtitle,
  callStatus,
  joinError,
  joining,
  mediaPreferences,
  onToggleAudio,
  onToggleVideo,
  onJoin,
  onJoinWithoutMedia,
  onBack,
}, ref) {
  const patientIsWaiting = callStatus === "waiting";
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

  // Live camera preview
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
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        // Camera preview is best-effort — if it fails the user can still join
      }
    }

    void startPreview();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [mediaPreferences.video]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111113] px-3 py-4 pb-[env(safe-area-inset-bottom)] sm:px-4 sm:py-6">
      <div className="w-full max-w-5xl text-white">
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* ── Left: Live preview ── */}
          <section className="relative overflow-hidden rounded-3xl bg-[#1a1a1f]">
            <div className="relative aspect-[16/10] w-full sm:aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[480px]">
              {mediaPreferences.video ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_center,#222225,#1a1a1f)]">
                  <div className="text-center">
                    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white/[0.06]">
                      <User className="h-12 w-12 text-white/25" />
                    </div>
                    <p className="mt-4 text-sm text-white/35">Camera is off</p>
                  </div>
                </div>
              )}

              {/* Overlay info */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-5 pb-5 pt-12">
                <p className="text-lg font-semibold">{title}</p>
                <p className="mt-0.5 text-sm text-white/50">{subtitle}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${mediaPreferences.video ? "bg-white/15 text-white/80" : "bg-white/10 text-white/50"}`}>
                    {mediaPreferences.video ? <Camera className="h-3 w-3" /> : <CameraOff className="h-3 w-3" />}
                    {mediaPreferences.video ? "Camera on" : "Camera off"}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${mediaPreferences.audio ? "bg-white/15 text-white/80" : "bg-white/10 text-white/50"}`}>
                    {mediaPreferences.audio ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                    {mediaPreferences.audio ? "Mic on" : "Muted"}
                  </span>
                </div>
              </div>

              {/* Patient waiting badge */}
              {patientIsWaiting ? (
                <div className="absolute right-4 top-4">
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-200 backdrop-blur-md">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    Patient waiting
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          {/* ── Right: Setup panel ── */}
          <section className="rounded-2xl border border-white/[0.06] bg-[#161618] p-4 sm:rounded-3xl sm:p-6 md:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/30">Doctor setup</p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
              Join consultation
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-white/45 sm:mt-2">
              Check your mic and camera, then enter the room.
            </p>

            {patientIsWaiting ? (
              <div className="mt-5 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.07] p-4 text-sm">
                <p className="font-medium text-emerald-300">Patient is waiting</p>
                <p className="mt-1 leading-relaxed text-emerald-300/60">
                  The patient has joined the waiting room and is ready for the consultation.
                </p>
              </div>
            ) : null}

            {/* Media toggles */}
            <div className="mt-6 grid gap-2.5">
              <MediaToggleCard
                active={mediaPreferences.video}
                title="Camera"
                description={mediaPreferences.video ? "Joining with video" : "Joining without camera"}
                icon={mediaPreferences.video ? Camera : CameraOff}
                onClick={onToggleVideo}
              />
              <MediaToggleCard
                active={mediaPreferences.audio}
                title="Microphone"
                description={mediaPreferences.audio ? "Joining with audio" : "Joining muted"}
                icon={mediaPreferences.audio ? Mic : MicOff}
                onClick={onToggleAudio}
              />
            </div>

            {joinError ? (
              <div className="mt-4 rounded-2xl border border-red-500/15 bg-red-500/[0.07] p-4 text-sm">
                <p className="font-medium text-red-300">Could not start media</p>
                <p className="mt-1 leading-relaxed text-red-300/60">{joinError}</p>
              </div>
            ) : null}

            {/* Patient info */}
            <div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/35">Patient</span>
                  <span className="font-medium text-white/80">{title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/35">Scheduled</span>
                  <span className="text-white/60">{subtitle || "-"}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 grid gap-2.5">
              <Button
                variant="brand"
                className="h-12 w-full rounded-2xl text-sm font-semibold"
                loading={joining}
                onClick={onJoin}
              >
                <Video className="h-4 w-4" />
                Join consultation
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full rounded-2xl border-white/[0.08] bg-transparent text-sm text-white/70 hover:bg-white/[0.06] hover:text-white sm:h-11"
                disabled={joining}
                onClick={onJoinWithoutMedia}
              >
                <Phone className="h-4 w-4" />
                Join without media
              </Button>
            </div>

            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-white/40 transition hover:text-white/60"
              onClick={onBack}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to appointments
            </button>
          </section>
        </div>
      </div>
    </div>
  );
});

function MediaToggleCard({
  active,
  title,
  description,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  icon: typeof Camera;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
        active
          ? "border-brand/20 bg-brand/[0.08] text-white"
          : "border-white/[0.06] bg-white/[0.03] text-white/60"
      }`}
    >
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${active ? "bg-brand text-white" : "bg-white/[0.06] text-white/40"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-white/40">{description}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${active ? "bg-brand/20 text-brand" : "bg-white/[0.06] text-white/35"}`}>
        {active ? "ON" : "OFF"}
      </span>
    </button>
  );
}

function DoctorInfoPanel({ appointment }: { appointment: DoctorAppointment }) {
  return (
    <div className="space-y-4">
      <InfoCard
        title="Patient"
        items={[
          { label: "Name", value: appointment.patient.full_name || "-" },
          {
            label: "Age / Sex",
            value: [appointment.patient.age ? `${appointment.patient.age}y` : null, appointment.patient.sex || null]
              .filter(Boolean)
              .join(" / ") || "-",
          },
          { label: "Phone", value: appointment.patient.phone || "-" },
          { label: "Email", value: appointment.patient.email || "-" },
        ]}
      />
      <InfoCard
        title="Appointment"
        items={[
          { label: "Scheduled", value: format(parseISO(appointment.scheduled_at), "hh:mm a, MMM d") },
          { label: "Duration", value: `${appointment.duration_min} min` },
          { label: "Mode", value: appointment.mode === "online" ? "Online video" : "Walk-in" },
          {
            label: "Type",
            value: appointment.appointment_type === "follow_up" ? "Follow-up" : "New consultation",
          },
          { label: "Payment", value: appointment.payment_status.replace("_", " ") },
        ]}
      />
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm leading-relaxed text-white/40">
        Complete the appointment after the call and continue with prescription work from the appointment screen.
      </div>
    </div>
  );
}

function InfoCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
        {title}
      </p>
      <div className="mt-3 space-y-2.5 text-sm">
        {items.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-3">
            <span className="text-white/35">{item.label}</span>
            <span className="max-w-[65%] text-right text-white/75">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
