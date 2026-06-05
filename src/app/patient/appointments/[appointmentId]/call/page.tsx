"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Image from "next/image";
import { RoomContext, LocalUserChoices } from "@livekit/components-react";
import "@livekit/components-styles";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CustomPreJoin } from "@/components/call/custom-pre-join";

import api, { getApiError, getRateLimitDescription, isNetworkError, isRateLimitError } from "@/lib/api";
import { formatTime, formatDate } from "@/lib/appointment-utils";
import { notifyError, notifyInfo } from "@/lib/notify";
import { useEventStream } from "@/hooks/use-event-stream";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { AuthGuard } from "@/components/auth-guard";
import { LiveCallRoom } from "@/components/call/live-call-room";
import { Button } from "@/components/ui/button";
import type { VideoTokenResponse } from "@/types/doctor";
import { useCallStore } from "@/stores/call-store";
import { callSession } from "@/lib/call-session";
import type { CameraFacingMode } from "@/lib/media";
import type { LocalVideoTrack, LocalAudioTrack } from "livekit-client";
import { logEvent } from "@/lib/logger";

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
  const isMountedRef = useRef(true);

  const { room, callState, callStartedAt } = useCallStore();
  const [joining, setJoining] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [preferredFacingMode, setPreferredFacingMode] = useState<CameraFacingMode>("user");

  const showPreview = callState === "idle" || callState === "preview_ready";
  const showSpinner = callState === "connecting" || callState === "connected" || callState === "publishing";
  const showCall = callState === "incall" || callState === "reconnecting";
  const showEnded = callState === "ended";

  const joinInFlightRef = useRef(false);
  const autoResumedRef = useRef(false);

  // Keep screen awake during consultation
  useWakeLock(showCall);

  useEffect(() => {
    isMountedRef.current = true;
    useCallStore.getState().reset();
    return () => {
      isMountedRef.current = false;
      void callSession.destroy();
    };
  }, []);

  // SSE: real-time updates
  useEventStream({
    path: "/patient/events/stream",
    keepAlive: showCall,
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

  const tokenRefresher = useCallback(async (reason?: string, options?: { signal?: AbortSignal }) => {
    try {
      const { data } = await api.post<VideoTokenResponse>(
        `/patient/appointments/${appointmentId}/video-token`,
        { recovery_reason: reason, session_id: callSession.getSessionId() },
        { signal: options?.signal }
      );
      if (data.epoch !== undefined) {
        callSession.updateEpoch(data.epoch);
      }
      if (data.session_id && data.session_id !== callSession.getSessionId()) {
        await callSession.destroy();
        callSession.resetSessionId(data.session_id);
      }
      return data.token;
    } catch (e) {
      throw new Error("Token refresh failed: " + String(e));
    }
  }, [appointmentId]);

  const joinCall = useCallback(
    async (values: LocalUserChoices, localTracks?: { videoTrack?: LocalVideoTrack; audioTrack?: LocalAudioTrack }) => {
      if (joinInFlightRef.current || callSession.getRoom()) return;

      const currentCallState = useCallStore.getState().callState;
      if (currentCallState !== "idle" && currentCallState !== "preview_ready") return;

      joinInFlightRef.current = true;
      setJoining(true);

      logEvent("JOIN_CLICKED", { role: "patient", values });

      try {
        if (appointment?.scheduled_at && joinWindow?.tooEarly) {
          const msg = formatEarlyJoinDescription(appointment.scheduled_at, joinWindow.opensAt);
          notifyInfo("Call not open yet", msg);
          return;
        }

        const { data } = await api.post<VideoTokenResponse>(
          `/patient/appointments/${appointmentId}/video-token`,
          { session_id: callSession.getSessionId() },
        );
        
        if (data.epoch !== undefined) {
          callSession.updateEpoch(data.epoch);
        }
        if (data.session_id && data.session_id !== callSession.getSessionId()) {
          await callSession.destroy();
          callSession.resetSessionId(data.session_id);
        }

        if (isMountedRef.current) {
          sessionStorage.setItem("activeCallChoices", JSON.stringify({ 
            audioEnabled: values.audioEnabled, 
            videoEnabled: values.videoEnabled,
            videoDeviceId: values.videoDeviceId,
            audioDeviceId: values.audioDeviceId
          }));
          
          logEvent("CONNECT_START", { role: "patient" });
          await callSession.connect(data.server_url, data.token, appointmentId, "patient", tokenRefresher);
          await callSession.publishTracks(
            values.audioEnabled,
            values.videoEnabled,
            preferredFacingMode,
            values.videoDeviceId,
            values.audioDeviceId,
            localTracks
          );
        }
      } catch (error) {
        const apiMessage = getApiError(error);
        notifyError("Couldn't join call", apiMessage);
      } finally {
        joinInFlightRef.current = false;
        if (isMountedRef.current) {
          setJoining(false);
        }
      }
    },
    [appointment, appointmentId, joinWindow, preferredFacingMode, tokenRefresher],
  );

  // Disconnect room if appointment status becomes "ended" mid-session
  useEffect(() => {
    if (appointment?.call_status === "ended" && room) {
      void callSession.disconnect();
    }
  }, [appointment?.call_status, room]);

  // Auto-resume call after page refresh
  useEffect(() => {
    if (autoResumedRef.current) return;
    const currentCallState = useCallStore.getState().callState;
    if (currentCallState === "idle" || currentCallState === "preview_ready") {
      const activeCallId = sessionStorage.getItem("activeCallId");
      const choicesRaw = sessionStorage.getItem("activeCallChoices");
      if (activeCallId === appointmentId && choicesRaw) {
        autoResumedRef.current = true;
        try {
          const choices = JSON.parse(choicesRaw);
          void joinCall(choices);
        } catch (e) {
          console.error("Failed to parse auto-resume choices", e);
        }
      }
    }
  }, [appointmentId, joinCall]);

  const canJoin = Boolean(
    appointment && appointment.mode === "online" && appointment.video_enabled && appointment.status === "confirmed" && appointment.call_status !== "ended",
  );

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

  if (appointment.call_status === "ended" || showEnded) {
    return <ConsultationEnded appointmentId={appointmentId} duration={appointment.duration_min} doctorName={appointment.doctor?.full_name || appointment.doctor_name || undefined} />;
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

  return (
    <div className="relative h-screen bg-app-bg flex flex-col" data-lk-theme="default">
      {/* 1. Lobby (PreJoin) */}
      {showPreview && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-start sm:justify-center overflow-y-auto bg-overlay py-6 px-4">
          <CustomPreJoin
            onSubmit={joinCall}
            userName={appointment?.patient_name || "Patient"}
            isJoining={joining}
            otherPartyWaiting={appointment?.call_status === "waiting"}
          />
        </div>
      )}

      {/* 2. Connecting State */}
      {showSpinner && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-overlay text-white">
          <Loader2 className="h-10 w-10 animate-spin text-brand mb-4" />
          <p className="text-sm font-medium text-white/60 animate-pulse">Connecting to call...</p>
        </div>
      )}

      {/* 3. Active Call */}
      {room && showCall && (
        <RoomContext.Provider value={room}>
          <LiveCallRoom
            title={appointment.doctor_name}
            subtitle={`${formatDate(appointment.scheduled_at)} · ${formatTime(appointment.scheduled_at)}`}
            remoteLabel={appointment.doctor_name}
            remoteWaitingTitle={`Waiting for Dr. ${appointment.doctor_name.split(" ").pop()}`}
            remoteWaitingDescription="You're in the consultation room. The doctor will appear here as soon as they join."
            onLeave={() => router.push(`/patient/appointments/${appointmentId}`)}
            onBack={() => router.push(`/patient/appointments/${appointmentId}`)}
            tokenRefresher={tokenRefresher}
            endLabel="Leave call"
            callStartedAt={callStartedAt}
            allowCameraSwitch
            preferredFacingMode={preferredFacingMode}
            onFacingModeChange={setPreferredFacingMode}
            infoLabel="Appointment details"
            infoContent={
              <div className="space-y-3 rounded-xl bg-white/6 p-4 text-sm text-white">
                <div className="flex justify-between">
                  <span className="text-white/45">Doctor</span>
                  <span className="text-white/85">{appointment.doctor_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/45">Date</span>
                  <span className="text-white/85">{formatDate(appointment.scheduled_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/45">Time</span>
                  <span className="text-white/85">{formatTime(appointment.scheduled_at)}</span>
                </div>
              </div>
            }
          />
        </RoomContext.Provider>
      )}
    </div>
  );
}

function ConsultationEnded({ appointmentId, duration, doctorName }: { appointmentId: string; duration?: number; doctorName?: string }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-6">
      <div className="w-full max-w-lg rounded-3xl border border-gray-200/80 bg-white px-8 py-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-status-success-bg">
          <CheckCircle2 className="h-8 w-8 text-status-success-text" />
        </div>
        <p className="mt-6 text-xl font-bold text-gray-900">Consultation Ended</p>
        
        <div className="mt-6 text-sm text-gray-700 bg-gray-50 rounded-2xl p-6 border border-gray-100 text-left space-y-4">
          <div className="flex justify-between items-center border-b border-gray-200/60 pb-3">
            <span className="text-gray-500 font-medium">Doctor</span>
            <span className="font-semibold text-gray-900">{doctorName ? `Dr. ${doctorName}` : "Your Doctor"}</span>
          </div>
          {duration && (
            <div className="flex justify-between items-center border-b border-gray-200/60 pb-3">
              <span className="text-gray-500 font-medium">Scheduled Duration</span>
              <span className="font-semibold text-gray-900">{duration} min</span>
            </div>
          )}
          <div className="pt-2">
            <p className="text-gray-600 leading-relaxed text-[13px]">
              Your doctor may share a prescription or notes shortly. You will receive notifications via WhatsApp/email once they are available.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Button className="rounded-xl h-12 text-[15px] font-semibold shadow-sm" onClick={() => router.push(`/patient/appointments/${appointmentId}`)}>
            View Appointment Details
          </Button>
          <Button variant="outline" className="rounded-xl h-12 text-[15px] font-semibold border-gray-200 text-gray-700 hover:bg-gray-50" onClick={() => router.push("/patient/dashboard")}>
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
