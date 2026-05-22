"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  LiveKitRoom, 
  VideoConference, 
  PreJoin,
  LocalUserChoices
} from "@livekit/components-react";
import "@livekit/components-styles";
import { CheckCircle2, Loader2, User } from "lucide-react";
import { format, parseISO } from "date-fns";

import { getApiError, getRateLimitDescription, isNetworkError, isRateLimitError } from "@/lib/api";
import { LIVEKIT_ROOM_OPTIONS } from "@/lib/media";
import { notifyError, notifyInfo } from "@/lib/notify";
import {
  createPublicAccessSession,
  publicApi,
  readPublicMagicTokenFromHash,
  scrubPublicMagicTokenFromUrl,
} from "@/lib/public-api";
import { useEventStream } from "@/hooks/use-event-stream";
import { ConnectionObserver } from "@/components/call/connection-observer";
import { useWakeLock } from "@/hooks/use-wake-lock";
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const appointmentId = params.appointmentId;
  const joinInFlightRef = useRef(false);
  const isMountedRef = useRef(true);

  // Keep screen awake during consultation
  useWakeLock();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [accessReady, setAccessReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<VideoTokenResponse | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);
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
    if (appointment?.call_status === "ended") {
      setTokenData(null);
      setCallEnded(true);
    }
  }, [appointment?.call_status]);

  const handleDisconnect = useCallback(() => {
    setTokenData(null);
    setCallEnded(true);
  }, []);

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
        {/* Banner context */}
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

        {/* Loading overlay when API token is fetching */}
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

  // Active Call (VideoConference)
  return (
    <LiveKitRoom
      key={appointmentId}
      serverUrl={tokenData.server_url}
      token={tokenData.token}
      connect
      options={LIVEKIT_ROOM_OPTIONS}
      className="h-screen"
      data-lk-theme="default"
      onDisconnected={handleDisconnect}
    >
      <ConnectionObserver />
      <VideoConference />
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
