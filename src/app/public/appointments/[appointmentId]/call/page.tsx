"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  LiveKitRoom, 
  LocalUserChoices,
  PreJoin
} from "@livekit/components-react";
import "@livekit/components-styles";
import { CheckCircle2, Loader2, User } from "lucide-react";
import { format, parseISO } from "date-fns";

import { getApiError, getRateLimitDescription, isNetworkError, isRateLimitError } from "@/lib/api";
import {
  buildPreferredAudioConstraints,
  buildPreferredVideoConstraints,
  LIVEKIT_ROOM_OPTIONS,
} from "@/lib/media";
import { notifyError, notifyInfo } from "@/lib/notify";
import {
  createPublicAccessSession,
  publicApi,
  readPublicMagicTokenFromHash,
  scrubPublicMagicTokenFromUrl,
} from "@/lib/public-api";
import { useEventStream } from "@/hooks/use-event-stream";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { LiveCallRoom } from "@/components/call/live-call-room";
import { Button } from "@/components/ui/button";
import type { PublicAppointment } from "@/types/public";
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

function PublicCallPageClient() {
  const params = useParams<{ appointmentId: string }>();
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

  const [accessReady, setAccessReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
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

  // Bootstrap access token
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

  // keepAlive prevents disconnect on mobile tab switch during active calls.
  useEventStream({
    path: `/public/events/stream/${appointmentId}`,
    enabled: accessReady && !accessError && Boolean(appointmentId),
    keepAlive: Boolean(tokenData),
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
    async (values: LocalUserChoices) => {
      if (joinInFlightRef.current) return;

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

        const { data } = await publicApi.post<VideoTokenResponse>(
          `/public/appointments/${appointmentId}/video-token`,
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

  // Disconnect room if appointment status becomes "ended"
  useEffect(() => {
    if (callEnded) return;
    if (appointment?.call_status === "ended") {
      callEndedRef.current = true;
      setTokenData(null);
      setCallEnded(true);
    }
  }, [appointment?.call_status, callEnded]);

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

  const canJoin = Boolean(
    appointment &&
      appointment.mode === "online" &&
      appointment.video_enabled &&
      appointment.status === "confirmed" &&
      appointment.call_status !== "ended",
  );

  const isDoctorConnected = appointment?.call_status === "waiting" || appointment?.call_status === "connected";

  // Update nowMs periodically for join-window countdown display only
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  // Already ended
  if (appointment.call_status === "ended" || callEnded) {
    return <ConsultationEnded />;
  }

  if (!canJoin) {
    return (
      <CallState
        title="This appointment is not ready for video"
        description="Only confirmed online appointments with video enabled can join from this link."
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
            <Button className="rounded-xl w-full bg-brand text-white hover:bg-brand/90" onClick={() => {
              setJoinError(null);
            }}>
              Try again
            </Button>
          </div>
        }
      />
    );
  }

  // Lobby (PreJoin)
  if (!tokenData) {
    return (
      <div className="relative h-screen bg-[#111113] flex flex-col" data-lk-theme="default">
        {/* Loading overlay when API token is fetching */}
        {joining && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
              <p className="text-white/80 font-medium">Connecting to secure room...</p>
            </div>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center">
          <PreJoin
            onSubmit={async (values) => {
              joinCall(values);
            }}
            defaults={{ audioEnabled: true, videoEnabled: true }}
          />
        </div>
      </div>
    );
  }

  // Active Call — consistent LiveCallRoom UI
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
        title={appointment.doctor_name ?? "Doctor"}
        subtitle={`${format(parseISO(appointment.scheduled_at), "hh:mm a")} · Consultation`}
        remoteLabel={appointment.doctor_name ?? "Doctor"}
        remoteWaitingTitle={`Waiting for Dr. ${(appointment.doctor_name ?? "Doctor").split(" ").pop()}`}
        remoteWaitingDescription="You're in the consultation room. The doctor will appear here as soon as they join."
        onLeave={() => setTokenData(null)}
        onBack={() => setTokenData(null)}
        onConnected={() => setCallStartedAt(Date.now())}
        tokenRefresher={tokenRefresher}
        endLabel="Leave call"
        callStartedAt={callStartedAt}
        infoLabel="Appointment details"
        infoContent={
          <div className="space-y-3 rounded-xl bg-white/6 p-4 text-sm text-white">
            <div className="flex justify-between">
              <span className="text-white/45">Doctor</span>
              <span className="text-white/85">{appointment.doctor_name ?? "Doctor"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/45">Date</span>
              <span className="text-white/85">
                {format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/45">Time</span>
              <span className="text-white/85">
                {format(parseISO(appointment.scheduled_at), "hh:mm a")}
              </span>
            </div>
          </div>
        }
      />
    </LiveKitRoom>
  );
}

function ConsultationEnded() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060B14] px-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/5 bg-white/5 px-8 py-10 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <p className="mt-6 text-xl font-bold text-white/90">Consultation Ended</p>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          The video call has finished. You can now close this tab.
        </p>
      </div>
    </div>
  );
}

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
      <div className="w-full max-w-lg rounded-3xl border border-white/5 bg-white/5 px-8 py-10 text-center shadow-2xl backdrop-blur-xl">
        <Image
          src="/images/logo.svg"
          alt="eHomeo"
          width={130}
          height={42}
          className="mx-auto h-7 w-auto brightness-0 invert"
        />
        <p className="mt-6 text-lg font-semibold text-white/90">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-white/50">{description}</p>
        {action}
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(PublicCallPageClient), { ssr: false });
