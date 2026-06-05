"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Lightbulb,
  Loader2,
  MonitorPlay,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";

import api from "@/lib/api";
import { formatTime, formatDate } from "@/lib/appointment-utils";
import {
  getMediaDeviceErrorMessage,
  prepareMediaChoices,
  type CameraFacingMode,
} from "@/lib/media";
import { notifyError, notifyInfo } from "@/lib/notify";
import { useCountdown } from "@/hooks/use-countdown";
import { useEventStream } from "@/hooks/use-event-stream";
import { PatientShell } from "@/components/patient/patient-shell";
import { LiveCallRoom } from "@/components/call/live-call-room";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/loading";
import { DoctorInfoCard } from "@/components/appointment/doctor-info-card";
import { cn } from "@/lib/utils";
import type { VideoTokenResponse } from "@/types/doctor";
import { useCallStore } from "@/stores/call-store";
import { callSession } from "@/lib/call-session";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { logEvent } from "@/lib/logger";

const TIPS = [
  "Find a quiet, well-lit place for your consultation.",
  "Keep your medical records or prescriptions handy.",
  "Write down any questions you want to ask the doctor.",
  "Ensure a stable internet connection for the best experience.",
  "Close other apps that might use your camera or microphone.",
];

type MediaPreferences = { audio: boolean; video: boolean };

function WaitingRoomContent() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const appointmentId = params.appointmentId as string;
  const [tipIndex, setTipIndex] = useState(0);

  const { room, callState, callStartedAt } = useCallStore();
  const showCall = callState === "incall" || callState === "reconnecting";
  const showEnded = callState === "ended";

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [mediaPreferences, setMediaPreferences] = useState<MediaPreferences>({
    audio: true,
    video: true,
  });
  const [preferredFacingMode, setPreferredFacingMode] =
    useState<CameraFacingMode>("user");
  const joinInFlightRef = useRef(false);
  const isMountedRef = useRef(true);

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

  // Notify backend when patient explicitly leaves
  const handleLeave = useCallback(() => {
    api.post(`/patient/appointments/${appointmentId}/leave-waiting-room`).catch(() => {});
    router.push(`/patient/appointments/${appointmentId}`);
  }, [appointmentId, router]);

  // Tell the backend we're in the waiting room (initial join + heartbeat every 15s)
  const joinedRef = useRef(false);
  useEffect(() => {
    const joinWaiting = () =>
      api
        .post(`/patient/appointments/${appointmentId}/join-waiting-room`)
        .catch(() => {});

    const sendHeartbeat = () =>
      api
        .post(`/patient/appointments/${appointmentId}/heartbeat`)
        .catch(() => {});

    if (!joinedRef.current) {
      joinedRef.current = true;
      joinWaiting();
    }

    // Heartbeat keeps presence alive in Redis (15s interval, 45s TTL server-side)
    const heartbeatInterval = setInterval(sendHeartbeat, 15_000);
    return () => clearInterval(heartbeatInterval);
  }, [appointmentId]);


  // Rotate tips
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch appointment data
  const { data: apt, isLoading } = useQuery({
    queryKey: ["patient", "appointment", appointmentId, "waiting"],
    queryFn: async () => {
      const { data } = await api.get(
        `/patient/appointments/${appointmentId}`,
      );
      return data;
    },
    // Faster polling in pre-connect phase so patient detects doctor quickly
    refetchInterval: room ? 30_000 : 10_000,
  });

  // SSE for appointment status updates
  const { connectionState: sseState, hasConnected: sseHasConnected } = useEventStream({
    path: "/patient/events/stream",
    keepAlive: showCall,
    onEvent: {
      call_state_changed: () => {
        queryClient.invalidateQueries({
          queryKey: ["patient", "appointment", appointmentId, "waiting"],
        });
      },
      appointment_completed: () => {
        queryClient.invalidateQueries({
          queryKey: ["patient", "appointment", appointmentId, "waiting"],
        });
      },
      appointment_no_show: () => {
        queryClient.invalidateQueries({
          queryKey: ["patient", "appointment", appointmentId, "waiting"],
        });
      },
    },
    onReconnect: () => {
      queryClient.invalidateQueries({
        queryKey: ["patient", "appointment", appointmentId, "waiting"],
      });
    },
  });

  const countdown = useCountdown(apt?.scheduled_at);

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

  // Connect to LiveKit — auto-join without redundant media check probes to avoid hardware locks
  const connectToRoom = useCallback(
    async () => {
      if (joinInFlightRef.current || room) return;

      joinInFlightRef.current = true;
      setJoining(true);
      setJoinError(null);

      logEvent("JOIN_CLICKED", { role: "patient_waiting" });

      try {
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
        
        let finalVideoDeviceId: string | undefined = undefined;
        let finalAudioDeviceId: string | undefined = undefined;

        try {
          // Request permissions and release them immediately (avoid camera lock)
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          tempStream.getTracks().forEach((track) => track.stop());
          
          // Sleep 200ms to allow camera hardware to fully release
          await new Promise((resolve) => setTimeout(resolve, 200));

          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter((d) => d.kind === "videoinput");
          const audioDevices = devices.filter((d) => d.kind === "audioinput");

          if (videoDevices.length > 0) {
            // Find front camera or use the first camera
            const frontCamera = videoDevices.find(
              (d) =>
                d.label.toLowerCase().includes("front") ||
                d.label.toLowerCase().includes("user") ||
                d.label.toLowerCase().includes("selfie")
            ) || videoDevices[0];
            finalVideoDeviceId = frontCamera.deviceId;
          }
          if (audioDevices.length > 0) {
            finalAudioDeviceId = audioDevices[0].deviceId;
          }
        } catch (e) {
          console.warn("Failed to request permission / pre-select devices in waiting room:", e);
        }

        if (isMountedRef.current) {
          sessionStorage.setItem("activeCallChoices", JSON.stringify({ 
            audioEnabled: true, 
            videoEnabled: true,
            videoDeviceId: finalVideoDeviceId,
            audioDeviceId: finalAudioDeviceId
          }));
          
          logEvent("CONNECT_START", { role: "patient_waiting" });
          await callSession.connect(data.server_url, data.token, appointmentId, "patient", tokenRefresher);
          await callSession.publishTracks(
            true, 
            true, 
            preferredFacingMode,
            finalVideoDeviceId,
            finalAudioDeviceId
          );
        }
      } catch (error) {
        const message = getMediaDeviceErrorMessage(error);
        setJoinError(message);
        notifyError("Couldn't join call", message);
      } finally {
        joinInFlightRef.current = false;
        if (isMountedRef.current) {
          setJoining(false);
        }
      }
    },
    [appointmentId, preferredFacingMode, room, tokenRefresher],
  );

  // Auto-connect to LiveKit when call state indicates readiness.
  // Patient is guest/passive: only connects if call_status is "waiting" or "connected".
  const autoConnectRef = useRef(false);
  useEffect(() => {
    if (autoConnectRef.current || room || joining) return;
    
    if (apt?.call_status === "ended") return;
    if (apt?.call_status === "waiting" || apt?.call_status === "connected") {
      autoConnectRef.current = true;
      void connectToRoom();
    }
  }, [connectToRoom, room, joining, apt?.call_status]);

  // ─── Loading state ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <PatientShell title="Waiting Room" subtitle="Loading...">
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </PatientShell>
    );
  }

  if (!apt) {
    return (
      <PatientShell title="Waiting Room" subtitle="Not found">
        <div className="mx-auto max-w-2xl py-16 text-center">
          <p className="text-sm text-gray-500">Appointment not found</p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => router.push("/patient/appointments")}
          >
            Back to Appointments
          </Button>
        </div>
      </PatientShell>
    );
  }

  // ─── Ended / Cannot Join logic ───────────────────────────────────
  if (apt.call_status === "ended" || showEnded) {
    return <ConsultationEnded appointmentId={appointmentId} duration={apt.duration_min} />;
  }

  const canJoin = Boolean(
    apt.mode === "online" && apt.video_enabled && apt.status === "confirmed"
  );

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

  if (room && showCall) {
    return (
      <RoomContext.Provider value={room}>
        <LiveCallRoom
          title={apt.doctor_name}
          subtitle={`${formatDate(apt.scheduled_at)} · ${formatTime(apt.scheduled_at)}`}
          remoteLabel={apt.doctor_name}
          remoteWaitingTitle={`Waiting for Dr. ${apt.doctor_name.split(" ").pop()}`}
          remoteWaitingDescription="You're in the consultation room. The doctor will appear here as soon as they join."
          onLeave={handleLeave}
          onBack={handleLeave}
          tokenRefresher={tokenRefresher}
          endLabel="Leave call"
          infoLabel="Appointment details"
          infoContent={
            <div className="space-y-3 rounded-xl bg-white/6 p-4 text-sm text-white">
              <div className="flex justify-between">
                <span className="text-white/45">Doctor</span>
                <span className="text-white/85">{apt.doctor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/45">Date</span>
                <span className="text-white/85">
                  {formatDate(apt.scheduled_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/45">Time</span>
                <span className="text-white/85">
                  {formatTime(apt.scheduled_at)}
                </span>
              </div>
            </div>
          }
          allowCameraSwitch
          preferredFacingMode={preferredFacingMode}
          onFacingModeChange={setPreferredFacingMode}
          callStartedAt={callStartedAt}
        />
      </RoomContext.Provider>
    );
  }

  // ─── Pre-connect waiting room UI ─────────────────────────────────
  const currentStep = joining ? 2 : 1;

  return (
    <PatientShell
      title="Waiting Room"
      subtitle={apt.doctor_name}
      headerRight={
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLeave}
          className="gap-1.5 text-gray-500 hover:text-gray-955 hover:bg-gray-100/50 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Leave
        </Button>
      }
    >
      <div className="mx-auto max-w-2xl space-y-5 px-1 py-2 sm:py-4 relative">
        {/* Ambient Depth Layer */}
        <div className="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-brand/5 blur-[140px] pointer-events-none" />
        <div className="absolute -right-28 -bottom-28 h-80 w-80 rounded-full bg-brand/5 blur-[140px] pointer-events-none" />

        {/* SSE connection lost banner — only after we've connected at least once */}
        {sseState === "disconnected" && sseHasConnected && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-status-warning-text/20 bg-status-warning-bg/80 px-4 py-3 text-sm text-status-warning-text backdrop-blur-sm shadow-sm animate-fade-in">
            <WifiOff className="h-4 w-4 shrink-0 text-status-warning-text" />
            <span className="font-medium">Connection lost — updates may be delayed</span>
          </div>
        )}

        {/* Status card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 backdrop-blur-md p-8 sm:p-10 text-center shadow-[0_24px_50px_-12px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(88,155,255,0.05),transparent_60%)] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center">
            {joining ? (
              <>
                <div className="relative mb-6 h-20 w-20 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-brand/5 blur-md animate-pulse" />
                  <div className="absolute inset-0 rounded-full border border-brand/20 animate-spin border-t-transparent" />
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-gray-900 font-display">
                  Connecting to consultation room
                </h2>
                <p className="mt-2 text-sm text-gray-500 max-w-xs leading-relaxed">
                  Setting up a secure peer-to-peer video connection...
                </p>
              </>
            ) : (
              <>
                <div className="relative mb-6 h-24 w-24 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-brand/5 blur-xl animate-pulse" />
                  <span
                    className="absolute inset-0 rounded-full border border-brand/20 opacity-0"
                    style={{ animation: "ping 3s cubic-bezier(0.16, 1, 0.3, 1) infinite" }}
                  />
                  <span
                    className="absolute inset-3 rounded-full border border-brand/35 opacity-0"
                    style={{ animation: "ping 3s cubic-bezier(0.16, 1, 0.3, 1) infinite 1s" }}
                  />
                  <span
                    className="absolute inset-6 rounded-full border border-brand/50 opacity-0"
                    style={{ animation: "ping 3s cubic-bezier(0.16, 1, 0.3, 1) infinite 2s" }}
                  />
                  <div className="absolute inset-6 flex items-center justify-center rounded-full bg-brand/10 border border-brand/35 shadow-inner backdrop-blur-sm z-10 shadow-[0_0_20px_rgba(88,155,255,0.25)]">
                    <Loader2 className="h-6 w-6 animate-spin text-brand" />
                  </div>
                </div>

                <h2 className="text-xl font-bold tracking-tight text-gray-900 font-display">
                  Waiting for Dr. {apt.doctor_name.split(" ").pop()}
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500 leading-relaxed">
                  You&apos;ll be connected automatically when the doctor joins. Please stay on this screen.
                </p>
              </>
            )}

            {/* Countdown */}
            {!countdown.isExpired && (
              <div className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-brand/[0.05] border border-brand/10 px-4 py-2 text-xs font-semibold tracking-tight text-brand backdrop-blur-sm">
                <Clock className="h-3.5 w-3.5 text-brand" />
                Starts in <span className="tabular-nums font-mono font-medium">{countdown.label}</span>
              </div>
            )}
            {countdown.isExpired && !joining && (
              <div className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-status-success-bg/85 border border-status-success-bg px-4 py-2 text-xs font-semibold tracking-tight text-status-success-text backdrop-blur-sm shadow-[0_0_12px_rgba(34,197,94,0.1)]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-state-live opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-state-live" />
                </span>
                Appointment time reached
              </div>
            )}
          </div>
        </motion.div>

        {/* Progress steps */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 backdrop-blur-md p-6 sm:p-7 shadow-[0_16px_36px_-10px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.9)]"
        >
          {(() => {
            const STEPS = [
              { label: "Joined", icon: Check },
              { label: "Media check", icon: MonitorPlay },
              { label: "Connecting", icon: Wifi },
              { label: "Consultation", icon: ShieldCheck },
            ];

            return (
              <div className="relative flex items-center justify-between w-full px-2 sm:px-6">
                {/* Background Track Line */}
                <div className="absolute top-[18px] left-[36px] right-[36px] h-[2.5px] bg-gray-100 rounded-full z-0 pointer-events-none" />
                
                {/* Active Progress Fill Line */}
                <div 
                  className="absolute top-[18px] left-[36px] h-[2.5px] bg-gradient-to-r from-state-live via-brand to-brand rounded-full z-0 transition-all duration-700 ease-out pointer-events-none"
                  style={{ 
                    width: `calc(${currentStep === 1 ? '33.33%' : currentStep === 2 ? '66.66%' : '100%'} - ${currentStep === 1 ? '16px' : currentStep === 2 ? '32px' : '48px'})` 
                  }}
                />

                {STEPS.map((step, i) => {
                  const StepIcon = step.icon;
                  const isComplete = i < currentStep;
                  const isCurrent = i === currentStep;
                  const isFuture = i > currentStep;

                  return (
                    <div key={step.label} className="relative z-10 flex flex-col items-center gap-2">
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 border shadow-sm",
                          isComplete && "bg-status-success-bg border-status-success-bg text-status-success-text shadow-emerald-100/50",
                          isCurrent && "bg-brand/10 border-brand text-brand ring-4 ring-brand/10 scale-110",
                          isFuture && "bg-white border-gray-200 text-gray-400",
                        )}
                      >
                        {isComplete ? (
                          <Check className="h-4 w-4 stroke-[2.5]" />
                        ) : (
                          <StepIcon className="h-4 w-4 stroke-[2]" />
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-center text-[10px] sm:text-xs font-semibold tracking-tight transition-colors duration-300",
                          isComplete && "text-status-success-text",
                          isCurrent && "text-brand font-bold",
                          isFuture && "text-gray-400",
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </motion.div>

        {/* Join error */}
        {joinError && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-status-error-text/20 bg-status-error-bg/80 p-4 backdrop-blur-sm text-sm"
          >
            <p className="font-bold text-status-error-text">Connection issue</p>
            <p className="mt-1 leading-relaxed text-status-error-text">{joinError}</p>
            <Button
              size="sm"
              className="mt-3 bg-error text-white hover:bg-error/90 rounded-xl transition-all active:scale-95 cursor-pointer"
              onClick={() => {
                autoConnectRef.current = false;
                setJoinError(null);
                void connectToRoom();
              }}
            >
              Try again
            </Button>
          </motion.div>
        )}

        {/* Doctor + details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-2 interactive cursor-pointer">
            <DoctorInfoCard 
              doctor={{ name: apt.doctor_name }} 
              className="h-full !bg-white/40 !backdrop-blur-sm !border-white/50 shadow-sm hover:!bg-white/80 transition-all duration-200 rounded-2xl"
            />
          </div>
          <div className="interactive col-span-1 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/50 p-4 flex flex-col justify-between hover:bg-white/85 hover:border-brand/20 shadow-sm transition-all duration-200 group cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400/80">
                Date
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/5 text-brand group-hover:bg-brand/10 transition-colors">
                <Calendar className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold tracking-tight text-gray-900 group-hover:text-brand transition-colors">
              {formatDate(apt.scheduled_at)}
            </p>
          </div>
          <div className="interactive col-span-1 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/50 p-4 flex flex-col justify-between hover:bg-white/85 hover:border-brand/20 shadow-sm transition-all duration-200 group cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400/80">
                Time
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/5 text-brand group-hover:bg-brand/10 transition-colors">
                <Clock className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold tracking-tight text-gray-900 group-hover:text-brand transition-colors">
              {formatTime(apt.scheduled_at)}
            </p>
          </div>
        </div>

        {/* Tips */}
        <div className="rounded-2xl border border-white/50 bg-gradient-to-br from-brand/[0.03] to-transparent p-5 backdrop-blur-sm shadow-sm relative overflow-hidden">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-status-warning-bg text-status-warning-text">
              <Lightbulb className="h-4 w-4 animate-pulse" />
            </div>
            <h3 className="text-sm font-bold tracking-tight text-gray-900">
              Consultation Tips
            </h3>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="text-sm leading-relaxed text-gray-600 min-h-[48px]"
            >
              {TIPS[tipIndex]}
            </motion.p>
          </AnimatePresence>
          <div className="mt-4 flex justify-center gap-1.5">
            {TIPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setTipIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300 cursor-pointer",
                  i === tipIndex ? "bg-brand w-5" : "bg-gray-200 hover:bg-gray-300 w-1.5",
                )}
                aria-label={`Go to tip ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Leave button */}
        <div className="pb-6 text-center">
          <button
            type="button"
            onClick={handleLeave}
            className="text-xs font-semibold tracking-wider uppercase text-gray-400 hover:text-gray-700 hover:underline transition-all duration-200 active:scale-95 cursor-pointer"
          >
            Leave Waiting Room
          </button>
        </div>
      </div>
    </PatientShell>
  );
}

function WaitingRoomPage() {
  return (
    <AuthGuard role="patient">
      <WaitingRoomContent />
    </AuthGuard>
  );
}

export default dynamic(() => Promise.resolve(WaitingRoomPage), {
  ssr: false,
});

function ConsultationEnded({ appointmentId, duration }: { appointmentId: string; duration?: number }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-6 relative overflow-hidden">
      {/* Background Lighting Layer */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(88,155,255,0.06),transparent_50%)]" />
      
      <div className="relative w-full max-w-lg rounded-3xl border border-white/50 bg-white/70 backdrop-blur-md px-8 py-10 text-center shadow-[0_24px_50px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]">
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-status-success-bg border border-status-success-bg shadow-[0_8px_20px_rgba(16,185,129,0.08)]">
          <div className="absolute inset-0 rounded-full bg-state-live/5 blur-md animate-pulse" />
          <CheckCircle2 className="h-10 w-10 text-status-success-text relative z-10" />
        </div>
        <h2 className="mt-8 text-2xl font-bold tracking-tight text-gray-900 font-display">Consultation Ended</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-500 max-w-xs mx-auto">
          The video call has finished successfully. Thank you for using eHomeo.
        </p>
        <div className="mt-10 flex flex-col gap-3">
          <Button 
            className="w-full h-11 rounded-xl bg-brand text-white font-bold shadow-md hover:bg-brand/90 hover:shadow-lg transition-all duration-200 active:scale-[0.98] cursor-pointer" 
            onClick={() => router.push(`/patient/appointments/${appointmentId}`)}
          >
            Return to Appointment
          </Button>
          <Button 
            variant="outline" 
            className="w-full h-11 rounded-xl border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold transition-all duration-200 active:scale-[0.98] cursor-pointer" 
            onClick={() => router.push("/patient/dashboard")}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

function CallState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-6 relative overflow-hidden">
      {/* Background Lighting Layer */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(88,155,255,0.06),transparent_50%)]" />

      <div className="relative w-full max-w-lg rounded-3xl border border-white/50 bg-white/70 backdrop-blur-md px-8 py-10 text-center shadow-[0_24px_50px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]">
        <Image src="/images/logo.svg" alt="eHomeo" width={130} height={42} className="mx-auto h-8 w-auto object-contain" />
        <h2 className="mt-8 text-xl font-bold tracking-tight text-gray-900 font-display">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-500 max-w-xs mx-auto">{description}</p>
        <div className="mt-8 flex justify-center w-full">
          {action}
        </div>
      </div>
    </div>
  );
}
