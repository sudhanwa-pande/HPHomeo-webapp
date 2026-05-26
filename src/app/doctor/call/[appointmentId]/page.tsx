"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LiveKitRoom, LocalUserChoices } from "@livekit/components-react";
import "@livekit/components-styles";
import { ArrowLeft, CheckCircle2, CircleAlert, Loader2, PhoneOff, User } from "lucide-react";
import { format, parseISO } from "date-fns";

import api from "@/lib/api";
import {
  getMediaDeviceErrorMessage,
  LIVEKIT_ROOM_OPTIONS,
} from "@/lib/media";
import { notifyApiError, notifyError, notifySuccess } from "@/lib/notify";
import { useEventStream } from "@/hooks/use-event-stream";
import { AuthGuard } from "@/components/auth-guard";
import { LiveCallRoom } from "@/components/call/live-call-room";
import { CustomPreJoin } from "@/components/call/custom-pre-join";
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
  const callEndedRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
  // keepAlive prevents disconnect on mobile tab switch during active calls.
  useEventStream({
    path: "/doctor/events/stream",
    keepAlive: Boolean(tokenData),
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
    if (callEndedRef.current) return;

    console.log("Disconnected:", reason);
    const reasonStr = String(reason);

    // Ignore transient network issues and let LiveKit's internal auto-reconnect handle it
    if (reasonStr === "network" || reasonStr === "CLIENT_INITIATED_RECONNECT" || reasonStr === "signal_connection_disconnected") {
      return;
    }

    if (["server_shutdown", "room_deleted", "user_rejected", "UNKNOWN_REASON"].some(r => reasonStr.includes(r))) {
        setJoinError("Connection dropped. Rejoin the consultation to continue.");
        setTokenData(null);
        setCallStartedAt(null);
        clearResumeAttemptLock();
    } else {
        setTokenData(null);
        setCallStartedAt(null);
        clearResumeAttemptLock();
    }
  }, [clearResumeAttemptLock]);

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
    async (values: LocalUserChoices) => {
      if (joinInFlightRef.current) {
        return;
      }

      joinInFlightRef.current = true;
      setJoining(true);
      setJoinError(null);

      try {
        const { data } = await api.post<VideoTokenResponse>(`/doctor/appointments/${appointmentId}/video-token`);
        
        if (isMountedRef.current) {
          setTokenData(data);
          setMediaPreferences({
            audio: values.audioEnabled,
            video: values.videoEnabled,
          });
          persistResumeState({
            audio: values.audioEnabled,
            video: values.videoEnabled,
          });
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
        if (isMountedRef.current) {
          setJoining(false);
        }
      }
    },
    [
      appointmentId,
      persistResumeState,
    ],
  );

  const tokenRefresher = useCallback(async () => {
    if (refreshInFlightRef.current) {
      // Don't return empty string — the SDK would try to use it as a JWT.
      // Throw so the SDK retries with the existing valid token.
      throw new Error("Token refresh already in progress");
    }
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
    if (callEnded) return;
    if (appointment?.call_status === "ended" && tokenData) {
      callEndedRef.current = true;
      setCallEnded(true);
      setTokenData(null);
      setCallStartedAt(null);
      clearResumeState();
    }
  }, [appointment?.call_status, tokenData, clearResumeState, callEnded]);

  const endCallMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/doctor/appointments/${appointmentId}/call/end`);
    },
    onSuccess: () => {
      notifySuccess("Call ended", "The consultation session has been closed.");
      clearResumeState();
      callEndedRef.current = true;
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
      const nextPreferences: LocalUserChoices = {
        videoEnabled: parsed.video ?? true,
        audioEnabled: parsed.audio ?? true,
        videoDeviceId: "",
        audioDeviceId: "",
        username: "",
      };
      setMediaPreferences({
        audio: nextPreferences.audioEnabled,
        video: nextPreferences.videoEnabled,
      });
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

  // Unified Render with Fake Instant Join Handoff
  return (
    <div className="relative h-screen bg-[#111113] flex flex-col" data-lk-theme="default">
      {/* 1. Lobby (PreJoin) - Acquires hardware locks seamlessly BEFORE joining. Stays mounted with a blur until connected. */}
      {(!tokenData || !callStartedAt) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#060B14]">
          <CustomPreJoin
            onSubmit={joinCall}
            patientName={appointment?.patient?.full_name || "Doctor"}
            isJoining={joining || !!tokenData}
            otherPartyWaiting={appointment?.call_status === "waiting"}
          />
        </div>
      )}

      {/* 2. Active Call — mounts WebRTC in the background, auto-acquires nothing */}
      {tokenData && (
        <LiveKitRoom
          key={appointmentId}
          serverUrl={tokenData.server_url}
          token={tokenData.token}
          connect={true}
          audio={false}
          video={false}
          options={LIVEKIT_ROOM_OPTIONS}
          onMediaDeviceFailure={handleMediaDeviceFailure}
          onDisconnected={handleDisconnected}
          className="h-full w-full"
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
      )}
    </div>
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
