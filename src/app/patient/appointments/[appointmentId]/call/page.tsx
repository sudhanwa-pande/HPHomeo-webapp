"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  LiveKitRoom, 
  PreJoin,
  LocalUserChoices
} from "@livekit/components-react";
import "@livekit/components-styles";
import { ArrowLeft, CheckCircle2, Loader2, User } from "lucide-react";
import { format, parseISO } from "date-fns";

import api, { getApiError, getRateLimitDescription, isNetworkError, isRateLimitError } from "@/lib/api";
import {
  buildPreferredAudioConstraints,
  buildPreferredVideoConstraints,
  LIVEKIT_ROOM_OPTIONS,
} from "@/lib/media";
import { formatTime, formatDate } from "@/lib/appointment-utils";
import { notifyError, notifyInfo } from "@/lib/notify";
import { useEventStream } from "@/hooks/use-event-stream";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { AuthGuard } from "@/components/auth-guard";
import { LiveCallRoom } from "@/components/call/live-call-room";
import { Button } from "@/components/ui/button";
import type { VideoTokenResponse } from "@/types/doctor";

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
  const isMountedRef = useRef(true);

  // Keep screen awake during consultation
  useWakeLock();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  const [tokenData, setTokenData] = useState<VideoTokenResponse | null>(null);
  const [mediaPreferences, setMediaPreferences] = useState<{audio: boolean; video: boolean}>({
    audio: true,
    video: true,
  });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);
  const callEndedRef = useRef(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // SSE: real-time updates
  // keepAlive prevents disconnect on mobile tab switch during active calls.
  useEventStream({
    path: "/patient/events/stream",
    keepAlive: Boolean(tokenData),
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

  const appointmentQuery = useQuery({
    queryKey: ["patient", "appointment", appointmentId, "call"],
    queryFn: async () => {
      const { data } = await api.get(
        `/patient/appointments/${appointmentId}`,
      );
      return data;
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

  const joinCall = useCallback(
    async (values: LocalUserChoices) => {
      if (joinInFlightRef.current) return;

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

        const { data } = await api.post<VideoTokenResponse>(
          `/patient/appointments/${appointmentId}/video-token`,
          {},
        );
        if (isMountedRef.current) {
          setTokenData(data);
          setMediaPreferences({
            audio: values.audioEnabled,
            video: values.videoEnabled,
          });
        }
      } catch (error) {
        const apiMessage = getApiError(error);
        setJoinError(apiMessage);
        notifyError("Couldn't join call", apiMessage);
      } finally {
        joinInFlightRef.current = false;
        if (isMountedRef.current) {
          setJoining(false);
        }
      }
    },
    [appointment, appointmentId, joinWindow],
  );

  // Disconnect room if appointment status becomes "ended" mid-session
  useEffect(() => {
    if (callEnded) return;
    if (appointment?.call_status === "ended") {
      callEndedRef.current = true;
      setTokenData(null);
      setCallEnded(true);
    }
  }, [appointment?.call_status, callEnded]);

  // When patient manually leaves or disconnects
  const handleDisconnect = useCallback((reason?: unknown) => {
    // Don't show "connection dropped" if the call was intentionally ended
    if (callEndedRef.current) return;
    const reasonStr = String(reason);
    if (["server_shutdown", "room_deleted", "user_rejected", "UNKNOWN_REASON"].some(r => reasonStr.includes(r))) {
      setTokenData(null);
      setCallStartedAt(null);
      setJoinError("Connection dropped. Please click Join to re-enter the consultation.");
    } else {
      setTokenData(null);
      setCallStartedAt(null);
    }
  }, []);

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

  const tokenRefresher = useCallback(async () => {
    if (refreshInFlightRef.current) {
      throw new Error("Token refresh already in progress");
    }
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

  const canJoin = Boolean(
    appointment && appointment.mode === "online" && appointment.video_enabled && appointment.status === "confirmed" && appointment.call_status !== "ended",
  );

  const isDoctorConnected = appointment?.call_status === "waiting" || appointment?.call_status === "connected";

  // Clock for join-window countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  // Already-ended appointment logic (Bug 3 Fix)
  if (appointment.call_status === "ended" || callEnded) {
    return <ConsultationEnded appointmentId={appointmentId} duration={appointment.duration_min} />;
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

  if (joinError && !tokenData && !joining) {
    return (
      <CallState
        title="Could not join call"
        description={joinError}
        action={
          <div className="mt-6 flex w-full flex-col gap-3 sm:max-w-xs mx-auto">
            <Button variant="ghost" className="rounded-xl w-full text-gray-500 hover:text-gray-700" onClick={() => {
              setJoinError(null);
            }}>
              Try again
            </Button>
            <Button variant="ghost" className="rounded-xl w-full text-gray-500 hover:text-gray-700" onClick={() => {
              router.push(`/patient/appointments/${appointmentId}`);
            }}>
              Back to appointment
            </Button>
          </div>
        }
      />
    );
  }

  // Lobby (PreJoin) - Acquires hardware locks seamlessly BEFORE joining
  if (!tokenData) {
    return (
      <div className="relative h-screen bg-[#111113] flex flex-col" data-lk-theme="default">
        {/* Banner context (Bug 4 Fix part A) */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
          <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 shadow-xl pointer-events-auto">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/20">
              <User className="h-5 w-5 text-brand" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">Dr. {appointment.doctor_name}</span>
              <span className="text-xs text-white/60">
                {format(parseISO(appointment.scheduled_at), "hh:mm a")} • Consultation
              </span>
            </div>
            {isDoctorConnected && (
              <div className="flex items-center gap-1.5 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Doctor is waiting</span>
              </div>
            )}
          </div>
        </div>

        {/* Loading overlay when API token is fetching (Bug 4 Fix part B) */}
        {joining && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
              <p className="text-white/80 font-medium">Connecting to secure room...</p>
            </div>
          </div>
        )}

        <div className="flex-1">
          <PreJoin
            onError={(err) => console.log('Media error (ignored in UI)', err)}
            defaults={{
              audioEnabled: true,
              videoEnabled: true,
            }}
            onSubmit={joinCall}
            className="h-full"
          />
        </div>
      </div>
    );
  }

  // Active Call — consistent LiveCallRoom UI (same as waiting room flow)
  return (
    <LiveKitRoom
      key={appointmentId}
      serverUrl={tokenData.server_url}
      token={tokenData.token}
      connect
      audio={buildPreferredAudioConstraints(mediaPreferences.audio)}
      video={buildPreferredVideoConstraints(mediaPreferences.video)}
      options={LIVEKIT_ROOM_OPTIONS}
      className="h-screen"
      onDisconnected={handleDisconnect}
      onMediaDeviceFailure={handleMediaDeviceFailure}
    >
      <LiveCallRoom
        title={appointment.doctor_name}
        subtitle={`${formatDate(appointment.scheduled_at)} · ${formatTime(appointment.scheduled_at)}`}
        remoteLabel={appointment.doctor_name}
        remoteWaitingTitle={`Waiting for Dr. ${appointment.doctor_name.split(" ").pop()}`}
        remoteWaitingDescription="You're in the consultation room. The doctor will appear here as soon as they join."
        onLeave={() =>
          router.push(`/patient/appointments/${appointmentId}`)
        }
        onBack={() =>
          router.push(`/patient/appointments/${appointmentId}`)
        }
        onConnected={() => setCallStartedAt(Date.now())}
        tokenRefresher={tokenRefresher}
        endLabel="Leave call"
        callStartedAt={callStartedAt}
        infoLabel="Appointment details"
        infoContent={
          <div className="space-y-3 rounded-xl bg-white/6 p-4 text-sm text-white">
            <div className="flex justify-between">
              <span className="text-white/45">Doctor</span>
              <span className="text-white/85">{appointment.doctor_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/45">Date</span>
              <span className="text-white/85">
                {formatDate(appointment.scheduled_at)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/45">Time</span>
              <span className="text-white/85">
                {formatTime(appointment.scheduled_at)}
              </span>
            </div>
          </div>
        }
      />
    </LiveKitRoom>
  );
}

function ConsultationEnded({ appointmentId, duration }: { appointmentId: string; duration?: number }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-6">
      <div className="w-full max-w-lg rounded-3xl border border-gray-200/80 bg-white px-8 py-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <p className="mt-6 text-xl font-bold text-gray-900">Consultation Ended</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          The video call has finished. Thank you for using eHomeo.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Button className="rounded-xl" onClick={() => router.push(`/patient/appointments/${appointmentId}`)}>
            Return to Appointment
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => router.push("/patient/dashboard")}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

function CallState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-6">
      <div className="w-full max-w-lg rounded-3xl border border-gray-200/80 bg-white px-8 py-10 text-center shadow-sm">
        <Image src="/images/logo.svg" alt="eHomeo" width={130} height={42} className="mx-auto h-7 w-auto" />
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
