"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useChat,
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
  useMediaDevices,
  useRemoteParticipants,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import type { TrackReference } from "@livekit/components-core";
import { isTrackReference } from "@livekit/components-core";
import { ConnectionQuality, ConnectionState, LocalTrack, Track } from "livekit-client";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Info,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  RefreshCw,
  Send,
  User,
  WifiOff,
  X,
} from "lucide-react";

import { notifyError, notifyInfo } from "@/lib/notify";
import { playIncomingMessageSound } from "@/lib/sound";
import {
  getFacingModeLabel,
  getMediaDeviceErrorMessage,
  getPreferredCameraDevice,
  LIVEKIT_AUDIO_CAPTURE_OPTIONS,
  type CameraFacingMode,
} from "@/lib/media";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LiveCallRoomProps = {
  title: string;
  subtitle: string;
  remoteLabel: string;
  remoteWaitingTitle: string;
  remoteWaitingDescription: string;
  onLeave: () => void;
  onBack?: () => void;
  onConnected?: () => void;
  /** NOTE: Not actively used in livekit-client v2.x (no room.setToken API).
   *  Kept for future SDK upgrades that may support in-session token rotation. */
  tokenRefresher?: () => Promise<string>;
  infoContent?: React.ReactNode;
  infoLabel?: string;
  endLabel?: string;
  endLoading?: boolean;
  allowScreenShare?: boolean;
  allowCameraSwitch?: boolean;
  preferredFacingMode?: CameraFacingMode;
  onFacingModeChange?: (mode: CameraFacingMode) => void;
  /** Timestamp (ms) when the call connected — set via onConnected, not on token fetch */
  callStartedAt?: number | null;
};

function getPublishedTrack(track: unknown): TrackReference | undefined {
  return isTrackReference(track) && track.publication?.track ? track : undefined;
}

function formatConnectionState(
  connectionState: ConnectionState,
  remoteCount: number,
) {
  if (connectionState === ConnectionState.Connected) {
    return remoteCount > 0 ? "Connected" : "Waiting";
  }
  if (connectionState === ConnectionState.Connecting) return "Connecting";
  if (connectionState === ConnectionState.Reconnecting) return "Reconnecting";
  return "Disconnected";
}

export function LiveCallRoom({
  title,
  subtitle,
  remoteLabel,
  remoteWaitingTitle,
  remoteWaitingDescription,
  onLeave,
  onBack,
  onConnected,
  tokenRefresher,
  infoContent,
  infoLabel = "Details",
  endLabel = "Leave call",
  endLoading = false,
  allowScreenShare = false,
  allowCameraSwitch = false,
  preferredFacingMode,
  onFacingModeChange,
  callStartedAt,
}: LiveCallRoomProps) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const remoteParticipants = useRemoteParticipants();
  const { chatMessages, send, isSending } = useChat();
  const {
    localParticipant,
    isCameraEnabled,
    isMicrophoneEnabled,
    isScreenShareEnabled,
    lastCameraError,
    lastMicrophoneError,
  } = useLocalParticipant();
  const trackSources = useMemo(
    () => [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.Microphone, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    [],
  );
  const trackQueryOptions = useMemo(() => ({ onlySubscribed: false }), []);
  const handleVideoDevicesError = useCallback((error: Error) => {
    notifyError("Camera unavailable", getMediaDeviceErrorMessage(error));
  }, []);
  const mediaDevicesOptions = useMemo(
    () => ({ kind: "videoinput" as const, onError: handleVideoDevicesError }),
    [handleVideoDevicesError],
  );
  const tracks = useTracks(trackSources, trackQueryOptions);
  const videoDevices = useMediaDevices(mediaDevicesOptions);

  // Remote participant connection quality.
  // useConnectionQualityIndicator throws "No participant provided" if the
  // argument is undefined. When the patient joins first (typical case),
  // remoteParticipants[0] is undefined, so we fall back to localParticipant
  // (always valid inside <LiveKitRoom>). hasWeakRemoteSignal still requires
  // an actual remote participant — the fallback is just to keep the hook
  // happy until the doctor joins.
  const qualityTarget = remoteParticipants[0] ?? localParticipant;
  const { quality: remoteQuality } = useConnectionQualityIndicator(
    { participant: qualityTarget },
  );
  const hasWeakRemoteSignal =
    remoteParticipants.length > 0 &&
    (remoteQuality === ConnectionQuality.Poor ||
      remoteQuality === ConnectionQuality.Lost);

  const [activePanel, setActivePanel] = useState<"chat" | "info" | null>(null);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileChromeVisible, setMobileChromeVisible] = useState(true);
  const [callDuration, setCallDuration] = useState("00:00");

  const cameraErrorRef = useRef<Error | undefined>(undefined);
  const micErrorRef = useRef<Error | undefined>(undefined);
  const chatBootstrappedRef = useRef(false);
  const chatMessageCountRef = useRef(0);
  const chromeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the remote participant ever joined this session
  const hasHadRemoteRef = useRef(false);
  // Fires onConnected exactly once when the room first reaches Connected
  const connectedOnceRef = useRef(false);

  // ── 1. onConnected — fire when first Connected (accurate callStartedAt) ──
  useEffect(() => {
    if (
      connectionState === ConnectionState.Connected &&
      !connectedOnceRef.current
    ) {
      connectedOnceRef.current = true;
      onConnected?.();
    }
  }, [connectionState, onConnected]);

  // ── 2. Connection timeout — disconnect after 20 s if stuck Connecting ──
  useEffect(() => {
    if (connectionState === ConnectionState.Connecting) {
      if (!connectTimeoutRef.current) {
        connectTimeoutRef.current = setTimeout(() => {
          room.disconnect();
        }, 45_000);
      }
    } else {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    }
    return () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    };
  }, [connectionState, room]);

  // ── 3. Token refresh — NOT needed with current architecture ──
  // With TTL = 7200s (2 hours), the original JWT covers the entire consultation.
  // livekit-client@2.x has no room.setToken() API. The only way to inject a new
  // token is by changing the `token` prop on <LiveKitRoom>, which triggers
  // room.connect() — a FULL WebRTC teardown + ICE restart. This would cause
  // audio/video freezes every refresh cycle and is worse than no refresh at all.
  // The JWT is only used for signaling (WebSocket); once the WebRTC peer
  // connection is established, media flows independently. If the signaling
  // WebSocket drops, the SDK reconnects using the original token (still valid
  // for up to 2 hours). No proactive refresh is needed.

  // ── 4. Force chrome visible during Reconnecting on mobile ──
  useEffect(() => {
    if (
      connectionState === ConnectionState.Reconnecting ||
      connectionState === ConnectionState.Disconnected
    ) {
      setMobileChromeVisible(true);
    }
  }, [connectionState]);

  // ── 5. iOS Safari visibilitychange — restart suspended tracks on foreground ──
  useEffect(() => {
    if (typeof document === "undefined") return;

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      // iOS Safari suspends MediaStreamTrack when the app is backgrounded.
      // Restart any track whose readyState has become 'ended'.
      room.localParticipant.getTrackPublications().forEach((pub) => {
        const track = pub.track;
        if (!track) return;
        const msTrack = track.mediaStreamTrack;
        if (msTrack && msTrack.readyState === "ended" && track instanceof LocalTrack) {
          track.restartTrack().catch(() => {});
        }
      });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [room]);

  // ── 6. Track whether remote ever connected ──
  useEffect(() => {
    if (remoteParticipants.length > 0) {
      hasHadRemoteRef.current = true;
    }
  }, [remoteParticipants]);

  // ── Call duration timer ──
  useEffect(() => {
    if (!callStartedAt) return;
    function updateDuration() {
      const elapsed = Math.max(
        0,
        Math.floor((Date.now() - callStartedAt!) / 1000),
      );
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      setCallDuration(
        hours > 0
          ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
          : `${pad(minutes)}:${pad(seconds)}`,
      );
    }
    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [callStartedAt]);

  const localVideoTrack = getPublishedTrack(
    tracks.find(
      (t) => t.participant.isLocal && t.source === Track.Source.Camera,
    ),
  );
  const remoteVideoTrack = getPublishedTrack(
    tracks.find(
      (t) => !t.participant.isLocal && t.source === Track.Source.Camera,
    ),
  );
  const remoteScreenTrack = getPublishedTrack(
    tracks.find(
      (t) => !t.participant.isLocal && t.source === Track.Source.ScreenShare,
    ),
  );

  const connectionLabel = useMemo(
    () => formatConnectionState(connectionState, remoteParticipants.length),
    [connectionState, remoteParticipants.length],
  );
  const isCameraLive = Boolean(localVideoTrack);
  const canSwitchCamera = allowCameraSwitch && videoDevices.length > 1;
  const isConnected = connectionState === ConnectionState.Connected;
  const isReconnecting = connectionState === ConnectionState.Reconnecting;
  const hasRemote = remoteParticipants.length > 0;

  // Derive contextual waiting-state message
  const remoteDroppedDescription = hasHadRemoteRef.current
    ? `${remoteLabel} disconnected — waiting to reconnect`
    : remoteWaitingDescription;

  useEffect(() => {
    if (lastCameraError && cameraErrorRef.current !== lastCameraError) {
      cameraErrorRef.current = lastCameraError;
      notifyError("Camera unavailable", getMediaDeviceErrorMessage(lastCameraError));
    }
  }, [lastCameraError]);

  useEffect(() => {
    if (lastMicrophoneError && micErrorRef.current !== lastMicrophoneError) {
      micErrorRef.current = lastMicrophoneError;
      notifyError(
        "Microphone unavailable",
        getMediaDeviceErrorMessage(lastMicrophoneError),
      );
    }
  }, [lastMicrophoneError]);

  useEffect(() => {
    if (!chatBootstrappedRef.current) {
      chatBootstrappedRef.current = true;
      chatMessageCountRef.current = chatMessages.length;
      return;
    }
    if (chatMessages.length <= chatMessageCountRef.current) return;
    const nextMessages = chatMessages.slice(chatMessageCountRef.current);
    chatMessageCountRef.current = chatMessages.length;
    const incomingMessages = nextMessages.filter((m) => !m.from?.isLocal);
    if (incomingMessages.length === 0) return;
    void playIncomingMessageSound();
    if (activePanel === "chat") return;
    setUnreadMessages((c) => c + incomingMessages.length);
    const latest = incomingMessages[incomingMessages.length - 1];
    notifyInfo(
      `New message from ${latest.from?.name || remoteLabel}`,
      latest.message,
    );
  }, [activePanel, chatMessages, remoteLabel]);

  useEffect(() => {
    if (activePanel === "chat" && unreadMessages > 0) setUnreadMessages(0);
  }, [activePanel, unreadMessages]);

  const scheduleChromeHide = useCallback(() => {
    if (!isMobileViewport || activePanel) return;
    if (chromeHideTimerRef.current) clearTimeout(chromeHideTimerRef.current);
    chromeHideTimerRef.current = setTimeout(
      () => setMobileChromeVisible(false),
      2600,
    );
  }, [activePanel, isMobileViewport]);

  const revealMobileChrome = useCallback(() => {
    if (!isMobileViewport) return;
    setMobileChromeVisible(true);
    scheduleChromeHide();
  }, [isMobileViewport, scheduleChromeHide]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = (e?: MediaQueryListEvent) => {
      const mobile = e ? e.matches : mq.matches;
      setIsMobileViewport(mobile);
      setMobileChromeVisible(true);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      if (chromeHideTimerRef.current) {
        clearTimeout(chromeHideTimerRef.current);
        chromeHideTimerRef.current = null;
      }
      return;
    }
    if (activePanel) {
      setMobileChromeVisible(true);
      if (chromeHideTimerRef.current) {
        clearTimeout(chromeHideTimerRef.current);
        chromeHideTimerRef.current = null;
      }
      return;
    }
    if (mobileChromeVisible) scheduleChromeHide();
    return () => {
      if (chromeHideTimerRef.current) {
        clearTimeout(chromeHideTimerRef.current);
        chromeHideTimerRef.current = null;
      }
    };
  }, [activePanel, isMobileViewport, mobileChromeVisible, scheduleChromeHide]);

  async function toggleCamera() {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (error) {
      notifyError("Camera update failed", getMediaDeviceErrorMessage(error));
    }
  }

  async function toggleMic() {
    try {
      await localParticipant.setMicrophoneEnabled(
        !isMicrophoneEnabled,
        !isMicrophoneEnabled ? LIVEKIT_AUDIO_CAPTURE_OPTIONS : undefined,
      );
    } catch (error) {
      notifyError("Microphone update failed", getMediaDeviceErrorMessage(error));
    }
  }

  async function toggleScreenShare() {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (error) {
      notifyError("Screen share failed", getMediaDeviceErrorMessage(error));
    }
  }

  async function switchCamera() {
    if (!canSwitchCamera || !preferredFacingMode) return;
    const nextFacingMode =
      preferredFacingMode === "user" ? "environment" : "user";
    setSwitchingCamera(true);
    try {
      const activeTrack = localVideoTrack?.publication?.track;
      if (!activeTrack && !isCameraEnabled) {
        await localParticipant.setCameraEnabled(true, {
          facingMode: nextFacingMode,
        });
      } else if (activeTrack && activeTrack instanceof LocalTrack) {
        await activeTrack.restartTrack({ facingMode: nextFacingMode });
      } else {
        const activeDeviceId = room.getActiveDevice("videoinput");
        const nextDevice = getPreferredCameraDevice(
          videoDevices,
          nextFacingMode,
          activeDeviceId,
        );
        if (!nextDevice?.deviceId) {
          throw new Error("No alternative camera is available on this device.");
        }
        await room.switchActiveDevice("videoinput", nextDevice.deviceId, false);
      }
      onFacingModeChange?.(nextFacingMode);
    } catch (error) {
      try {
        const activeDeviceId = room.getActiveDevice("videoinput");
        const currentIndex = videoDevices.findIndex(
          (d) => d.deviceId === activeDeviceId,
        );
        const fallback =
          videoDevices[
            currentIndex >= 0 ? (currentIndex + 1) % videoDevices.length : 0
          ];
        if (!fallback?.deviceId) throw error;
        await room.switchActiveDevice("videoinput", fallback.deviceId, false);
        onFacingModeChange?.(nextFacingMode);
      } catch (fallbackError) {
        notifyError(
          "Camera switch failed",
          getMediaDeviceErrorMessage(fallbackError),
        );
      }
    } finally {
      setSwitchingCamera(false);
    }
  }

  /* ─────────────────────────── Render ─────────────────────────── */
  return (
    <div
      className="h-screen overflow-hidden bg-[#111113] text-white"
      onPointerDownCapture={() => revealMobileChrome()}
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* ── Top bar ─────────────────────────────────────────── */}
        <header
          className={cn(
            "z-30 flex-shrink-0 transition-all duration-300",
            isMobileViewport
              ? mobileChromeVisible
                ? "translate-y-0 opacity-100"
                : "-translate-y-full opacity-0"
              : "translate-y-0 opacity-100",
          )}
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
            {/* Left: back + title */}
            <div className="flex min-w-0 items-center gap-2.5">
              {onBack ? (
                <button
                  type="button"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-white/70 transition active:bg-white/[0.14] hover:bg-white/[0.12] hover:text-white"
                  onClick={onBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold leading-tight text-white/95">
                  {title}
                </p>
                <p className="mt-0.5 truncate text-xs text-white/40">{subtitle}</p>
              </div>
            </div>

            {/* Right: status + timer + actions */}
            <div className="flex flex-shrink-0 items-center gap-2">
              {/* Connection status */}
              <div className="hidden items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-white/50 sm:flex">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isConnected && hasRemote
                      ? "bg-emerald-400"
                      : isReconnecting
                        ? "bg-amber-400 animate-pulse"
                        : isConnected
                          ? "bg-amber-400"
                          : "bg-white/30",
                  )}
                />
                {connectionLabel}
              </div>

              {/* Duration */}
              {callStartedAt ? (
                <div className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-medium tabular-nums text-white/50">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                  </span>
                  {callDuration}
                </div>
              ) : null}

              {/* Chat */}
              <button
                type="button"
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95",
                  activePanel === "chat"
                    ? "bg-white/[0.14] text-white"
                    : "bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/80",
                )}
                onClick={() =>
                  setActivePanel((c) => (c === "chat" ? null : "chat"))
                }
              >
                <MessageSquare className="h-4 w-4" />
                {unreadMessages > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                ) : null}
              </button>

              {/* Info */}
              {infoContent ? (
                <button
                  type="button"
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95",
                    activePanel === "info"
                      ? "bg-white/[0.14] text-white"
                      : "bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/80",
                  )}
                  onClick={() =>
                    setActivePanel((c) => (c === "info" ? null : "info"))
                  }
                >
                  <Info className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {/* ── Video area ──────────────────────────────────────── */}
        <div className="relative min-h-0 flex-1">
          {/* Remote video / waiting state */}
          <div className="absolute inset-0">
            {remoteScreenTrack ? (
              <VideoTrack
                trackRef={remoteScreenTrack}
                className="h-full w-full object-contain bg-black"
              />
            ) : remoteVideoTrack ? (
              <VideoTrack
                trackRef={remoteVideoTrack}
                className="h-full w-full object-contain bg-[#111113]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_center,#1a1a1f_0%,#111113_70%)]">
                <div className="max-w-sm px-6 text-center">
                  <div className="relative mx-auto h-28 w-28 sm:h-36 sm:w-36">
                    <span
                      className="absolute inset-0 rounded-full border border-white/[0.04]"
                      style={{
                        animation:
                          "ping 4s cubic-bezier(0, 0, 0.2, 1) infinite",
                      }}
                    />
                    <span
                      className="absolute inset-3 rounded-full border border-white/[0.06]"
                      style={{
                        animation:
                          "ping 4s cubic-bezier(0, 0, 0.2, 1) infinite 1.3s",
                      }}
                    />
                    <span
                      className="absolute inset-6 rounded-full border border-white/[0.08]"
                      style={{
                        animation:
                          "ping 4s cubic-bezier(0, 0, 0.2, 1) infinite 2.6s",
                      }}
                    />
                    <div className="absolute inset-8 flex items-center justify-center rounded-full bg-white/[0.06] backdrop-blur-sm">
                      <User className="h-8 w-8 text-white/30 sm:h-10 sm:w-10" />
                    </div>
                  </div>
                  <p className="mt-6 text-base font-semibold tracking-tight text-white/85 sm:mt-8 sm:text-xl">
                    {hasRemote ? remoteLabel : remoteWaitingTitle}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-white/40">
                    {hasRemote
                      ? `${remoteLabel} is connected.`
                      : remoteDroppedDescription}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 text-[11px] font-medium text-white/40">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isConnected ? "bg-emerald-400" : "bg-white/30",
                      )}
                    />
                    {connectionLabel}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Remote connection quality badge ──────────────── */}
          {hasWeakRemoteSignal && (
            <div className="pointer-events-none absolute left-3 top-3 z-10 sm:left-4 sm:top-4">
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/90 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md">
                <WifiOff className="h-3 w-3" />
                Weak connection
              </div>
            </div>
          )}

          {/* Remote participant label (top-left, only when video is showing) */}
          {(remoteVideoTrack || remoteScreenTrack) && !hasWeakRemoteSignal ? (
            <div
              className={cn(
                "pointer-events-none absolute left-3 top-3 z-10 transition-all duration-300 sm:left-4 sm:top-4",
                isMobileViewport
                  ? mobileChromeVisible
                    ? "translate-y-0 opacity-100"
                    : "-translate-y-4 opacity-0"
                  : "translate-y-0 opacity-100",
              )}
            >
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-md">
                <User className="h-3 w-3" />
                {remoteLabel}
              </div>
            </div>
          ) : null}

          {/* ── Reconnecting overlay ────────────────────────── */}
          {isReconnecting && (
            <div className="absolute inset-0 z-25 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#1a1a1f]/95 px-7 py-6 text-center shadow-2xl">
                <Loader2 className="h-7 w-7 animate-spin text-white/60" />
                <p className="text-sm font-semibold text-white">
                  Reconnecting…
                </p>
                <p className="text-xs text-white/40">
                  Your call will resume shortly
                </p>
              </div>
            </div>
          )}

          {/* ── Local PiP preview (bottom-right) ───────────── */}
          <div
            className={cn(
              "absolute z-10 transition-all duration-300",
              isMobileViewport
                ? "right-3 w-[28vw] min-w-[88px] max-w-[130px]"
                : "right-5 w-[160px]",
            )}
            style={{
              bottom: isMobileViewport
                ? "calc(7.5rem + env(safe-area-inset-bottom, 0px))"
                : "6.5rem",
            }}
          >
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1f] shadow-[0_8px_32px_rgba(0,0,0,0.5)] sm:rounded-2xl">
              <div
                className={cn(
                  "relative",
                  isMobileViewport ? "aspect-[3/4]" : "aspect-[4/3]",
                )}
              >
                {localVideoTrack ? (
                  <VideoTrack
                    trackRef={localVideoTrack}
                    className="h-full w-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <CameraOff className="h-4 w-4 text-white/25" />
                  </div>
                )}
                {/* Mic indicator */}
                <div className="absolute bottom-1.5 left-1.5">
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full sm:h-6 sm:w-6",
                      isMicrophoneEnabled
                        ? "bg-black/40 backdrop-blur-sm"
                        : "bg-red-500/90",
                    )}
                  >
                    {isMicrophoneEnabled ? (
                      <Mic className="h-2.5 w-2.5 text-white/80 sm:h-3 sm:w-3" />
                    ) : (
                      <MicOff className="h-2.5 w-2.5 text-white sm:h-3 sm:w-3" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Control bar ────────────────────────────────── */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 transition-all duration-300 sm:px-6",
              isMobileViewport
                ? mobileChromeVisible
                  ? "translate-y-0 opacity-100"
                  : "translate-y-6 opacity-0"
                : "translate-y-0 opacity-100",
            )}
            style={{
              paddingBottom:
                "calc(1rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-[#1a1a1f]/90 px-3 py-3 shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:gap-4 sm:px-5">
              {/* Mic */}
              <ControlButton
                active={isMicrophoneEnabled}
                icon={isMicrophoneEnabled ? Mic : MicOff}
                label={isMicrophoneEnabled ? "Mute" : "Unmute"}
                onClick={toggleMic}
              />
              {/* Camera */}
              <ControlButton
                active={isCameraLive}
                icon={isCameraLive ? Camera : CameraOff}
                label={isCameraLive ? "Video" : "Video off"}
                onClick={toggleCamera}
              />
              {/* Camera flip */}
              {canSwitchCamera && preferredFacingMode ? (
                <ControlButton
                  active
                  icon={RefreshCw}
                  label="Flip"
                  onClick={() => void switchCamera()}
                  neutral
                  disabled={switchingCamera}
                  spinning={switchingCamera}
                />
              ) : null}
              {/* Screen share */}
              {allowScreenShare ? (
                <ControlButton
                  active={!isScreenShareEnabled}
                  icon={isScreenShareEnabled ? MonitorOff : Monitor}
                  label={isScreenShareEnabled ? "Stop" : "Share"}
                  onClick={toggleScreenShare}
                  neutral
                />
              ) : null}

              <div className="mx-0.5 hidden h-8 w-px bg-white/[0.08] sm:block" />

              {/* Leave */}
              <button
                type="button"
                className="flex h-11 items-center gap-2 rounded-full bg-red-500 px-4 text-sm font-semibold text-white transition hover:bg-red-400 active:scale-[0.97] active:bg-red-600 disabled:opacity-60 sm:px-5"
                onClick={onLeave}
                disabled={endLoading}
              >
                <PhoneOff className="h-4 w-4" />
                <span className="hidden sm:inline">{endLabel}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Side panel (chat / info) ────────────────────────── */}
        {activePanel ? (
          <>
            <button
              type="button"
              aria-label="Close side panel"
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] md:bg-black/30"
              onClick={() => setActivePanel(null)}
            />
            <aside
              className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] border-l border-white/[0.06] bg-[#161618]/[0.98] shadow-[-8px_0_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:w-[360px] sm:max-w-[380px]"
              style={{
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                paddingTop: "env(safe-area-inset-top, 0px)",
              }}
            >
              {activePanel === "chat" ? (
                <ChatPanel
                  chatMessages={chatMessages}
                  isSending={isSending}
                  onClose={() => setActivePanel(null)}
                  remoteLabel={remoteLabel}
                  onSend={send}
                />
              ) : (
                <InfoPanel
                  label={infoLabel}
                  onClose={() => setActivePanel(null)}
                  content={infoContent}
                />
              )}
            </aside>
          </>
        ) : null}

        <RoomAudioRenderer />
      </div>
    </div>
  );
}

/* ───────────────── Control Button ───────────────── */

function ControlButton({
  active,
  icon: Icon,
  label,
  onClick,
  neutral = false,
  disabled = false,
  spinning = false,
}: {
  active: boolean;
  icon: typeof Mic;
  label: string;
  onClick: () => void;
  neutral?: boolean;
  disabled?: boolean;
  spinning?: boolean;
}) {
  const bgClass = neutral
    ? "bg-white/[0.08] text-white/80 hover:bg-white/[0.14] active:bg-white/[0.20]"
    : active
      ? "bg-white/[0.10] text-white hover:bg-white/[0.16] active:bg-white/[0.22]"
      : "bg-red-500/90 text-white hover:bg-red-500 active:bg-red-600";

  return (
    <button
      type="button"
      className={cn(
        "group relative flex flex-col items-center gap-1",
        disabled && "pointer-events-none opacity-50",
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full transition-all duration-150 active:scale-[0.93] sm:h-12 sm:w-12",
          bgClass,
        )}
      >
        <Icon
          className={cn(
            "h-[18px] w-[18px] sm:h-5 sm:w-5",
            spinning && "animate-spin",
          )}
        />
      </div>
      <span className="hidden text-[10px] font-medium text-white/40 sm:block">
        {label}
      </span>
    </button>
  );
}

/* ───────────────── Chat Panel ───────────────── */

function ChatPanel({
  chatMessages,
  isSending,
  onSend,
  onClose,
  remoteLabel,
}: {
  chatMessages: ReturnType<typeof useChat>["chatMessages"];
  isSending: boolean;
  onClose: () => void;
  onSend: ReturnType<typeof useChat>["send"];
  remoteLabel: string;
}) {
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  async function handleSend() {
    const value = message.trim();
    if (!value) return;
    await onSend(value);
    setMessage("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-white">Chat</p>
          <p className="mt-0.5 text-[11px] text-white/35">
            Messages stay in this session
          </p>
        </div>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/50 transition active:scale-95 hover:bg-white/[0.10] hover:text-white/70"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4"
      >
        {chatMessages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-[13px] leading-relaxed text-white/30">
            No messages yet. Use chat to share quick notes or if audio drops.
          </div>
        ) : null}
        {chatMessages.map((chatMessage, index) => {
          const isLocal = chatMessage.from?.isLocal;
          return (
            <div
              key={`${chatMessage.timestamp}-${index}`}
              className={cn("flex", isLocal ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px]",
                  isLocal
                    ? "bg-brand text-white"
                    : "bg-white/[0.07] text-white/90",
                )}
              >
                <p
                  className={cn(
                    "mb-0.5 text-[10px] font-semibold",
                    isLocal ? "text-white/60" : "text-white/35",
                  )}
                >
                  {isLocal ? "You" : chatMessage.from?.name || remoteLabel}
                </p>
                <p className="break-words leading-relaxed">
                  {chatMessage.message}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/[0.06] px-4 py-3">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Type a message…"
            className="h-11 rounded-xl border-white/[0.08] bg-white/[0.05] text-sm text-white placeholder:text-white/25 focus-visible:ring-brand/30"
          />
          <button
            type="button"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand text-white transition active:scale-95 hover:bg-brand/90 disabled:opacity-40"
            disabled={!message.trim() || isSending}
            onClick={() => void handleSend()}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Info Panel ───────────────── */

function InfoPanel({
  label,
  content,
  onClose,
}: {
  label: string;
  content: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-0.5 text-[11px] text-white/35">
            Consultation context
          </p>
        </div>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/50 transition active:scale-95 hover:bg-white/[0.10] hover:text-white/70"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{content}</div>
    </div>
  );
}
