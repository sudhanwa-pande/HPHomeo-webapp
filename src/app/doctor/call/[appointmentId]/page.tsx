import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RoomContext, LocalUserChoices } from "@livekit/components-react";
import "@livekit/components-styles";
import { ArrowLeft, CheckCircle2, CircleAlert, Loader2, PhoneOff } from "lucide-react";
import { format, parseISO } from "date-fns";

import api from "@/lib/api";
import {
  getMediaDeviceErrorMessage,
} from "@/lib/media";
import { notifyApiError, notifyError, notifySuccess } from "@/lib/notify";
import { useEventStream } from "@/hooks/use-event-stream";
import { AuthGuard } from "@/components/auth-guard";
import { LiveCallRoom } from "@/components/call/live-call-room";
import { CustomPreJoin } from "@/components/call/custom-pre-join";
import { Button } from "@/components/ui/button";
import type { DoctorAppointment } from "@/types/doctor";
import { useCallStore } from "@/stores/call-store";
import { callSession } from "@/lib/call-session";
import { useWakeLock } from "@/hooks/use-wake-lock";

interface VideoTokenResponse {
  provider: string;
  server_url: string;
  room: string;
  token: string;
}

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
  const isMountedRef = useRef(true);

  const { room, uiPhase, callStartedAt } = useCallStore();
  const [joining, setJoining] = useState(false);

  useWakeLock(uiPhase === "incall" || uiPhase === "reconnecting");

  useEffect(() => {
    isMountedRef.current = true;
    useCallStore.getState().reset();
    return () => {
      isMountedRef.current = false;
      void callSession.destroy();
    };
  }, []);

  // SSE for real-time call status updates.
  useEventStream({
    path: "/doctor/events/stream",
    keepAlive: uiPhase === "incall" || uiPhase === "reconnecting",
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

  const { data: appointment, isLoading: appointmentLoading } = useQuery({
    queryKey: ["doctor-appointment-detail", appointmentId],
    queryFn: async () => {
      const { data } = await api.get<DoctorAppointment>(`/doctor/appointments/${appointmentId}`);
      return data;
    },
  });

  const joinCall = useCallback(
    async (values: LocalUserChoices) => {
      // Guard against double joins or joining in incorrect phase
      if (uiPhase !== "prejoin" || callSession.getRoom()) return;

      setJoining(true);
      try {
        const { data } = await api.post<VideoTokenResponse>(`/doctor/appointments/${appointmentId}/video-token`);
        
        if (isMountedRef.current) {
          sessionStorage.setItem("activeCallChoices", JSON.stringify({ audioEnabled: values.audioEnabled, videoEnabled: values.videoEnabled }));
          await callSession.connect(data.server_url, data.token, appointmentId, "doctor", tokenRefresher);
          await callSession.publishTracks(values.audioEnabled, values.videoEnabled);
        }
      } catch (error) {
        const message = getMediaDeviceErrorMessage(error);
        notifyError("Couldn't start call", message);
      } finally {
        if (isMountedRef.current) {
          setJoining(false);
        }
      }
    },
    [appointmentId, uiPhase],
  );

  const tokenRefresher = useCallback(async (reason?: string) => {
    try {
      const { data } = await api.post<VideoTokenResponse>(
        `/doctor/appointments/${appointmentId}/video-token`,
        { recovery_reason: reason }
      );
      return data.token;
    } catch (e) {
      throw new Error("Token refresh failed: " + String(e));
    }
  }, [appointmentId]);

  // Auto-resume call after page refresh
  useEffect(() => {
    if (uiPhase === "prejoin") {
      const activeCallId = sessionStorage.getItem("activeCallId");
      const choicesRaw = sessionStorage.getItem("activeCallChoices");
      if (activeCallId === appointmentId && choicesRaw) {
        try {
          const choices = JSON.parse(choicesRaw);
          void joinCall(choices);
        } catch (e) {
          console.error("Failed to parse auto-resume choices", e);
        }
      }
    }
  }, [appointmentId, uiPhase, joinCall]);

  // Disconnect room if appointment status becomes "ended" (via SSE/polling)
  useEffect(() => {
    if (appointment?.call_status === "ended" && room) {
      void callSession.disconnect();
    }
  }, [appointment?.call_status, room]);

  const endCallMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/doctor/appointments/${appointmentId}/call/end`);
    },
    onSuccess: () => {
      notifySuccess("Call ended", "The consultation session has been closed.");
      void callSession.disconnect();
      queryClient.invalidateQueries({ queryKey: ["doctor-waiting"] });
      queryClient.invalidateQueries({ queryKey: ["doctor-appointments"] });
    },
    onError: (error) => notifyApiError(error, "Couldn't end call"),
  });

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

  if (!canStartCall && uiPhase !== "ended") {
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

  return (
    <div className="relative h-screen bg-[#111113] flex flex-col" data-lk-theme="default">
      {/* 1. Lobby (PreJoin) */}
      {uiPhase === "prejoin" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#060B14]">
          <CustomPreJoin
            onSubmit={joinCall}
            patientName={appointment?.patient?.full_name || "Doctor"}
            isJoining={joining}
            otherPartyWaiting={appointment?.call_status === "waiting"}
          />
        </div>
      )}

      {/* 2. Connecting State */}
      {uiPhase === "connecting" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#060B14] text-white">
          <Loader2 className="h-10 w-10 animate-spin text-brand mb-4" />
          <p className="text-sm font-medium text-white/60 animate-pulse">Connecting to call...</p>
        </div>
      )}

      {/* 3. Active Call */}
      {room && (uiPhase === "incall" || uiPhase === "reconnecting") && (
        <RoomContext.Provider value={room}>
          <LiveCallRoom
            title={appointment?.patient?.full_name ?? "Video consultation"}
            subtitle={appointment ? format(parseISO(appointment.scheduled_at), "EEE, dd MMM yyyy - hh:mm a") : "Consultation"}
            remoteLabel={appointment?.patient?.full_name ?? "Patient"}
            remoteWaitingTitle={appointment?.patient?.full_name ? `Waiting for ${appointment.patient.full_name}` : "Waiting for patient"}
            remoteWaitingDescription="The patient will appear here when they join the consultation room."
            onBack={() => router.push(`/doctor/appointments/${appointmentId}`)}
            onLeave={() => endCallMutation.mutate()}
            tokenRefresher={tokenRefresher}
            endLoading={endCallMutation.isPending}
            endLabel="End consultation"
            allowScreenShare
            callStartedAt={callStartedAt}
            infoLabel="Patient details"
            infoContent={appointment ? <DoctorInfoPanel appointment={appointment} /> : null}
          />
        </RoomContext.Provider>
      )}

      {/* 4. Ended Screen */}
      {uiPhase === "ended" && (
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
                onClick={() => {
                  router.push(`/doctor/appointments/${appointmentId}`);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to appointments
              </Button>
            </div>
          </div>
        </div>
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
