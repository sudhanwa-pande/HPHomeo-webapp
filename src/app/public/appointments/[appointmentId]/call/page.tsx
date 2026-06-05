"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Image from "next/image";
import { RoomContext, LocalUserChoices } from "@livekit/components-react";
import "@livekit/components-styles";
import { CheckCircle2, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { CustomPreJoin } from "@/components/call/custom-pre-join";

import { getApiError, getRateLimitDescription, isNetworkError, isRateLimitError } from "@/lib/api";
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

function PublicCallPageClient() {
  const params = useParams<{ appointmentId: string }>();
  const queryClient = useQueryClient();
  const appointmentId = params.appointmentId;
  const isMountedRef = useRef(true);

  const { room, callState, callStartedAt } = useCallStore();
  const [joining, setJoining] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [accessReady, setAccessReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
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

  // SSE stream
  useEventStream({
    path: `/public/events/stream/${appointmentId}`,
    enabled: accessReady && !accessError && Boolean(appointmentId),
    keepAlive: showCall,
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

  const tokenRefresher = useCallback(async (reason?: string, options?: { signal?: AbortSignal }) => {
    try {
      const { data } = await publicApi.post<VideoTokenResponse>(
        `/public/appointments/${appointmentId}/video-token`,
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

      logEvent("JOIN_CLICKED", { role: "public", values });

      try {
        if (appointment?.scheduled_at && joinWindow?.tooEarly) {
          const earlyMessage = formatEarlyJoinDescription(appointment.scheduled_at, joinWindow.opensAt);
          notifyInfo("Call not open yet", earlyMessage);
          return;
        }

        const { data } = await publicApi.post<VideoTokenResponse>(
          `/public/appointments/${appointmentId}/video-token`,
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
          
          logEvent("CONNECT_START", { role: "public" });
          await callSession.connect(data.server_url, data.token, appointmentId, "public", tokenRefresher);
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

  // Disconnect room if appointment status becomes "ended"
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
    appointment &&
      appointment.mode === "online" &&
      appointment.video_enabled &&
      appointment.status === "confirmed" &&
      appointment.call_status !== "ended",
  );

  // Update nowMs periodically for join-window display
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // ── Loading ───────────────────────────────────────────────────────
  if (!accessReady || appointmentQuery.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-overlay">
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

  if (appointment.call_status === "ended" || showEnded) {
    return <ConsultationEnded duration={appointment.duration_min} doctorName={appointment.doctor_name || undefined} />;
  }

  if (!canJoin) {
    return (
      <CallState
        title="This appointment is not ready for video"
        description="Only confirmed online appointments with video enabled can join from this link."
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
            title={appointment.doctor_name ?? "Doctor"}
            subtitle={`${format(parseISO(appointment.scheduled_at), "hh:mm a")} · Consultation`}
            remoteLabel={appointment.doctor_name ?? "Doctor"}
            remoteWaitingTitle={`Waiting for Dr. ${(appointment.doctor_name ?? "Doctor").split(" ").pop()}`}
            remoteWaitingDescription="You're in the consultation room. The doctor will appear here as soon as they join."
            onLeave={() => void callSession.disconnect()}
            onBack={() => void callSession.disconnect()}
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
        </RoomContext.Provider>
      )}
    </div>
  );
}

function ConsultationEnded({ duration, doctorName }: { duration?: number; doctorName?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-overlay px-6 relative overflow-hidden">
      {/* Background Lighting Layer */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(88,155,255,0.06),transparent_50%)] animate-pulse" />
      <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-brand/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-brand/5 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-lg rounded-3xl border border-call-border bg-panel px-8 py-10 text-center shadow-2xl backdrop-blur-xl z-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-state-live/10 border border-state-live/20">
          <CheckCircle2 className="h-8 w-8 text-state-live" />
        </div>
        <p className="mt-6 text-xl font-bold text-white/90">Consultation Ended</p>
        
        <div className="mt-6 text-sm text-white/70 bg-app-bg rounded-2xl p-6 border border-call-border text-left space-y-4 shadow-inner">
          <div className="flex justify-between items-center border-b border-call-border pb-3">
            <span className="text-white/40 font-medium">Doctor</span>
            <span className="font-semibold text-white/90">{doctorName ? `Dr. ${doctorName}` : "Your Doctor"}</span>
          </div>
          {duration && (
            <div className="flex justify-between items-center border-b border-call-border pb-3">
              <span className="text-white/40 font-medium">Scheduled Duration</span>
              <span className="font-semibold text-white/90">{duration} min</span>
            </div>
          )}
          <div className="pt-2">
            <p className="text-white/50 leading-relaxed text-[13px]">
              Your doctor may share a prescription or notes shortly. You will receive notifications via WhatsApp/email once they are available.
            </p>
          </div>
        </div>

        <p className="mt-8 text-sm leading-relaxed text-white/40">
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
    <div className="flex min-h-screen items-center justify-center bg-overlay px-6 relative overflow-hidden">
      {/* Background Lighting Layer */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(88,155,255,0.06),transparent_50%)]" />
      <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-brand/5 blur-[120px] pointer-events-none" />
      <div className="absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-brand/5 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-lg rounded-3xl border border-call-border bg-panel px-8 py-10 text-center shadow-2xl backdrop-blur-xl z-10">
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
