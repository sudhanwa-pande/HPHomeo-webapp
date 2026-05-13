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
  const queryClient = useQueryClient();
  const appointmentId = params.appointmentId;
  const joinInFlightRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const autoResumeAttemptedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
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

  // Polling fallback to detect status drift if SSE drops
  useEffect(() => {
    if (!tokenData) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["patient", "appointment", appointmentId, "call"] });
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
          const msg = formatEarlyJoinDescription(appointment.scheduled_at, joinWindow.opensAt);
          setJoinError(msg);
          notifyInfo("Call not open yet", msg);
          return;
        }

        setMediaPreferences({ audio: wantsAudio, video: wantsVideo });
        persistResumeState({ audio: wantsAudio, video: wantsVideo }, nextFacingMode);

        // Use authenticated patient video-token endpoint
        const { data } = await api.post<VideoTokenResponse>(
          `/patient/appointments/${appointmentId}/video-token`,
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
        if (isMountedRef.current) {
          setJoining(false);
        }
      }
    },
    [appointment, appointmentId, clearResumeAttemptLock, joinWindow, mediaPreferences.audio, mediaPreferences.video, persistResumeState, preferredFacingMode],
  );

  const tokenRefresher = useCallback(async () => {
    if (refreshInFlightRef.current) return "";
    refreshInFlightRef.current = true;
    try {
      const { data } = await api.post<VideoTokenResponse>(
        `/patient/appointments/${appointmentId}/video-token`,
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
    const message = kind === "audioinput"
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
    appointment && appointment.mode === "online" && appointment.video_enabled && appointment.status === "confirmed" && appointment.call_status !== "ended",
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

  // Auto-join immediately
  const autoJoinAttemptedRef = useRef(false);
  useEffect(() => {
    if (autoJoinAttemptedRef.current || tokenData || joining || !canAttemptJoinNow) return;
    autoJoinAttemptedRef.current = true;
    void joinCall({ audio: true, video: true, facingMode: "user" });
  }, [canAttemptJoinNow, joinCall, joining, tokenData]);

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

  if (joinError) {
    return (
      <CallState
        title="Could not join call"
        description={joinError}
        action={
          <div className="mt-6 flex w-full flex-col gap-3 sm:max-w-xs mx-auto">
            <Button className="rounded-xl w-full" onClick={() => {
              joinInFlightRef.current = false;
              void joinCall({ audio: true, video: true, facingMode: "user" });
            }}>
              Try again
            </Button>
            <Button variant="outline" className="rounded-xl w-full border-gray-200" onClick={() => {
              joinInFlightRef.current = false;
              void joinCall({ audio: false, video: false });
            }}>
              Join without media
            </Button>
            <Button variant="ghost" className="rounded-xl w-full text-gray-500 hover:text-gray-700" onClick={() => {
              clearResumeState();
              router.push(`/patient/appointments/${appointmentId}`);
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
      <div className="flex min-h-screen items-center justify-center bg-brand-bg px-6">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" />
          <p className="mt-4 text-sm font-medium text-gray-900">Joining consultation...</p>
        </div>
      </div>
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
        tokenRefresher={tokenRefresher}
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
