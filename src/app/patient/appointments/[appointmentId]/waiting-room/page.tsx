"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Check,
  Clock,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  MonitorPlay,
  RefreshCw,
  ShieldCheck,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";

import api from "@/lib/api";
import { formatTime, formatDate } from "@/lib/appointment-utils";
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
import { useCountdown } from "@/hooks/use-countdown";
import { useEventStream } from "@/hooks/use-event-stream";
import { AuthGuard } from "@/components/auth-guard";
import { PatientShell } from "@/components/patient/patient-shell";
import { LiveCallRoom } from "@/components/call/live-call-room";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/loading";
import { DoctorInfoCard } from "@/components/appointment/doctor-info-card";
import { MediaTestPanel } from "@/components/appointment/media-test-panel";
import { cn } from "@/lib/utils";
import type { PatientAppointmentsResponse } from "@/types/patient";
import type { VideoTokenResponse } from "@/types/doctor";

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
  const [mediaChecked, setMediaChecked] = useState(false);

  // LiveKit state
  const [tokenData, setTokenData] = useState<VideoTokenResponse | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [mediaPreferences, setMediaPreferences] = useState<MediaPreferences>({
    audio: true,
    video: true,
  });
  const [preferredFacingMode, setPreferredFacingMode] =
    useState<CameraFacingMode>("user");
  const joinInFlightRef = useRef(false);

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
      const { data } = await api.get<PatientAppointmentsResponse>(
        "/patient/appointments",
        { params: { limit: 100 } },
      );
      return (
        data.items.find((a) => a.appointment_id === appointmentId) || null
      );
    },
    refetchInterval: 30_000,
  });

  // SSE for appointment status updates
  const { connectionState: sseState, hasConnected: sseHasConnected } = useEventStream({
    path: "/patient/events/stream",
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

  const videoOptions = useMemo(
    () =>
      buildPreferredVideoConstraints(
        mediaPreferences.video,
        preferredFacingMode,
      ),
    [mediaPreferences.video, preferredFacingMode],
  );

  // Connect to LiveKit — called after media check passes
  const connectToRoom = useCallback(
    async (options?: Partial<MediaPreferences>) => {
      if (joinInFlightRef.current || tokenData) return;

      const wantsAudio = options?.audio ?? mediaPreferences.audio;
      const wantsVideo = options?.video ?? mediaPreferences.video;

      joinInFlightRef.current = true;
      setJoining(true);
      setJoinError(null);

      try {
        const prepared = await prepareMediaChoices({
          audio: wantsAudio,
          video: wantsVideo,
          preferredFacingMode,
        });
        setMediaPreferences({
          audio: prepared.audio,
          video: prepared.video,
        });

        if (prepared.warning) {
          notifyInfo("Joining with available devices", prepared.warning);
        }

        const { data } = await api.post<VideoTokenResponse>(
          `/patient/appointments/${appointmentId}/video-token`,
          {},
        );
        setTokenData(data);
        // callStartedAt is set via onConnected when the room actually connects.
      } catch (error) {
        const message = getMediaDeviceErrorMessage(error);
        setJoinError(message);
        if (
          error instanceof Error &&
          [
            "NotAllowedError",
            "NotFoundError",
            "NotReadableError",
            "AbortError",
          ].includes(error.name)
        ) {
          notifyError("Couldn't start media", message);
        } else {
          notifyApiError(error, "Couldn't connect to consultation room");
        }
      } finally {
        joinInFlightRef.current = false;
        setJoining(false);
      }
    },
    [appointmentId, mediaPreferences.audio, mediaPreferences.video, preferredFacingMode, tokenData],
  );

  // Auto-connect to LiveKit once media check passes
  const autoConnectRef = useRef(false);
  useEffect(() => {
    if (!mediaChecked || autoConnectRef.current || tokenData || joining) return;
    autoConnectRef.current = true;
    void connectToRoom();
  }, [mediaChecked, connectToRoom, tokenData, joining]);

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

  const handleDisconnect = useCallback(() => {
    setJoinError("Connection dropped. Trying to reconnect...");
    setTokenData(null);
    // Allow reconnection
    autoConnectRef.current = false;
  }, []);

  // ─── If connected to LiveKit, show full-screen call UI ───────────
  if (tokenData && apt) {
    return (
      <LiveKitRoom
        key={`${appointmentId}:${tokenData.token}`}
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
          title={apt.doctor_name}
          subtitle={`${formatDate(apt.scheduled_at)} · ${formatTime(apt.scheduled_at)}`}
          remoteLabel={apt.doctor_name}
          remoteWaitingTitle={`Waiting for Dr. ${apt.doctor_name.split(" ").pop()}`}
          remoteWaitingDescription="You're in the consultation room. The doctor will appear here as soon as they join."
          onLeave={() =>
            router.push(`/patient/appointments/${appointmentId}`)
          }
          onConnected={() => setCallStartedAt(Date.now())}
          tokenRefresher={async () => {
            const { data } = await api.post<VideoTokenResponse>(
              `/patient/appointments/${appointmentId}/video-token`,
              {},
            );
            setTokenData(data);
            return data.token;
          }}
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
      </LiveKitRoom>
    );
  }

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

  // ─── Pre-connect waiting room UI ─────────────────────────────────
  const currentStep = joining ? 2 : mediaChecked ? 2 : 1;

  return (
    <PatientShell
      title="Waiting Room"
      subtitle={apt.doctor_name}
      headerRight={
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLeave}
          className="gap-1 text-gray-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Leave
        </Button>
      }
    >
      <div className="mx-auto max-w-2xl space-y-4">
        {/* SSE connection lost banner — only after we've connected at least once */}
        {sseState === "disconnected" && sseHasConnected && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>Connection lost — updates may be delayed</span>
          </div>
        )}

        {/* Status card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-gray-200/60 bg-white p-8 text-center"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(88,155,255,0.03),transparent_50%)]" />

          <div className="relative">
            {joining ? (
              <>
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-brand" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Connecting to consultation room
                </h2>
                <p className="mt-1.5 text-sm text-gray-500">
                  Setting up your video connection...
                </p>
              </>
            ) : (
              <>
                <div className="relative mx-auto mb-5 h-20 w-20">
                  <span
                    className="absolute inset-0 rounded-full border border-brand/10"
                    style={{ animation: "ping 3s cubic-bezier(0, 0, 0.2, 1) infinite" }}
                  />
                  <span
                    className="absolute inset-2 rounded-full border border-brand/15"
                    style={{ animation: "ping 3s cubic-bezier(0, 0, 0.2, 1) infinite 1s" }}
                  />
                  <div className="absolute inset-4 flex items-center justify-center rounded-full bg-brand/[0.06]">
                    <Loader2 className="h-6 w-6 animate-spin text-brand" />
                  </div>
                </div>

                <h2 className="text-lg font-semibold text-gray-900">
                  Waiting for Dr. {apt.doctor_name.split(" ").pop()}
                </h2>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-gray-500">
                  {mediaChecked
                    ? "You'll be connected automatically when the doctor joins"
                    : "Complete the media check below to get started"}
                </p>
              </>
            )}

            {/* Countdown */}
            {!countdown.isExpired && (
              <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-brand/[0.06] px-4 py-2 text-sm font-medium text-brand">
                <Clock className="h-4 w-4" />
                Starts in {countdown.label}
              </div>
            )}
            {countdown.isExpired && !joining && (
              <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                </span>
                Appointment time reached
              </div>
            )}
          </div>
        </motion.div>

        {/* Progress steps */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-gray-200/60 bg-white p-5"
        >
          {(() => {
            const STEPS = [
              { label: "Joined", icon: Check },
              { label: "Media check", icon: MonitorPlay },
              { label: "Connecting", icon: Wifi },
              { label: "Consultation", icon: ShieldCheck },
            ];

            return (
              <div className="flex items-center justify-between">
                {STEPS.map((step, i) => {
                  const StepIcon = step.icon;
                  const isComplete = i < currentStep;
                  const isCurrent = i === currentStep;
                  const isFuture = i > currentStep;

                  return (
                    <div key={step.label} className="flex flex-1 items-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <div
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full transition-all",
                            isComplete && "bg-emerald-50 text-emerald-600",
                            isCurrent && "bg-brand/[0.08] text-brand ring-2 ring-brand/15",
                            isFuture && "bg-gray-50 text-gray-300",
                          )}
                        >
                          {isComplete ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <StepIcon className="h-4 w-4" />
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-center text-[10px] font-medium leading-tight",
                            isComplete && "text-emerald-600",
                            isCurrent && "text-brand",
                            isFuture && "text-gray-400",
                          )}
                        >
                          {step.label}
                        </span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div
                          className={cn(
                            "mx-1 mt-[-18px] h-[2px] flex-1 rounded-full transition-colors",
                            i < currentStep ? "bg-emerald-200" : "bg-gray-100",
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </motion.div>

        {/* Join error */}
        {joinError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
            <p className="font-medium text-red-800">Connection issue</p>
            <p className="mt-1 leading-relaxed text-red-600">{joinError}</p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => {
                autoConnectRef.current = false;
                setJoinError(null);
                void connectToRoom();
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {/* Doctor + details */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <DoctorInfoCard doctor={{ name: apt.doctor_name }} />
          </div>
          <div className="rounded-2xl border border-gray-200/60 bg-white px-4 py-4 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Date
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {formatDate(apt.scheduled_at)}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200/60 bg-white px-4 py-4 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Time
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {formatTime(apt.scheduled_at)}
            </p>
          </div>
        </div>

        {/* Media test — once passed, auto-connects to LiveKit */}
        {!mediaChecked && (
          <MediaTestPanel onMediaReady={() => setMediaChecked(true)} />
        )}

        {/* Tips */}
        <div className="rounded-2xl border border-gray-200/60 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Consultation Tips
            </h3>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={tipIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
              className="text-sm leading-relaxed text-gray-600"
            >
              {TIPS[tipIndex]}
            </motion.p>
          </AnimatePresence>
          <div className="mt-3 flex gap-1">
            {TIPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i === tipIndex ? "bg-brand" : "bg-gray-100",
                )}
              />
            ))}
          </div>
        </div>

        {/* Leave button */}
        <div className="pb-6 text-center">
          <button
            type="button"
            onClick={handleLeave}
            className="text-sm text-gray-400 transition hover:text-gray-600"
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

export default dynamic(() => Promise.resolve(WaitingRoomPage), { ssr: false });
