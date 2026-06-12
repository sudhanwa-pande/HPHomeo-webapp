"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useChat,
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
  useMediaDevices,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
  ParticipantTile,
  RoomAudioRenderer,
} from "@livekit/components-react";
import type { TrackReference } from "@livekit/components-core";
import { isTrackReference } from "@livekit/components-core";
import { ConnectionQuality, ConnectionState, Track } from "livekit-client";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  FileText,
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
  Maximize,
  Minimize,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  CommandMenu,
  type CommandAction,
} from "@/components/doctor/command-menu";
import { Drawer } from "vaul";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { notifyError, notifyInfo } from "@/lib/notify";
import { playIncomingMessageSound, playPatientWaitingSound } from "@/lib/sound";
import { logEvent } from "@/lib/logger";
import {
  getMediaDeviceErrorMessage,
  getPreferredCameraDevice,
  LIVEKIT_AUDIO_CAPTURE_OPTIONS,
  type CameraFacingMode,
} from "@/lib/media";
import { cn } from "@/lib/utils";
import { useCallUIController } from "@/hooks/use-call-ui-controller";
import { CallLayout } from "@/components/call/call-layout";
import { Input } from "@/components/ui/input";
import { useCallStore } from "@/stores/call-store";

type LiveCallRoomProps = {
  title: string;
  subtitle: string;
  remoteLabel: string;
  remoteWaitingTitle: string;
  remoteWaitingDescription: string;
  onLeave: () => void;
  onBack?: () => void;
  /** Active token refresher callback used by CallSessionManager for session recovery */
  tokenRefresher?: (reason?: string) => Promise<string>;
  infoContent?: React.ReactNode;
  infoLabel?: string;
  endLabel?: string;
  endLoading?: boolean;
  allowScreenShare?: boolean;
  allowCameraSwitch?: boolean;
  preferredFacingMode?: CameraFacingMode;
  onFacingModeChange?: (mode: CameraFacingMode) => void;
  /** Timestamp (ms) when the call connected */
  callStartedAt?: number | null;
  showWorkspaceLayout?: boolean;
  workspaceActiveTab?: "notes" | "info" | "chat";
  onWorkspaceTabChange?: (tab: "notes" | "info" | "chat") => void;
  workspaceContent?: React.ReactNode;
  className?: string;
  isFullScreenLayout?: boolean;
  onToggleFullScreen?: () => void;
  isPiP?: boolean;
};

function getPublishedTrack(track: unknown): TrackReference | undefined {
  return isTrackReference(track) && track.publication?.track
    ? track
    : undefined;
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
  showWorkspaceLayout = false,
  workspaceActiveTab = "notes",
  onWorkspaceTabChange,
  workspaceContent,
  className,
  isFullScreenLayout = true,
  onToggleFullScreen,
  isPiP = false,
}: LiveCallRoomProps) {
  const room = useRoomContext();
  const { error, _setError } = useCallStore();

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
  const { quality: remoteQuality } = useConnectionQualityIndicator({
    participant: qualityTarget,
  });
  const hasWeakRemoteSignal =
    remoteParticipants.length > 0 &&
    (remoteQuality === ConnectionQuality.Poor ||
      remoteQuality === ConnectionQuality.Lost);

  const { quality: localQuality } = useConnectionQualityIndicator({
    participant: localParticipant,
  });
  const hasWeakLocalSignal =
    localQuality === ConnectionQuality.Poor ||
    localQuality === ConnectionQuality.Lost;

  const ui = useCallUIController(
    "consultation",
    showWorkspaceLayout ? "prescription" : "none",
  );
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileChromeVisible, setMobileChromeVisible] = useState(true);
  const [callDuration, setCallDuration] = useState("00:00");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(!isFullScreenLayout);

  useEffect(() => {
    setWorkspaceOpen(!isFullScreenLayout);
  }, [isFullScreenLayout]);

  useEffect(() => {
    if (isPiP && ui.mode !== "pip") {
      ui.enterPiP();
    } else if (!isPiP && ui.mode === "pip") {
      ui.exitPiP();
    }
  }, [isPiP, ui]);

  const cameraErrorRef = useRef<Error | undefined>(undefined);
  const micErrorRef = useRef<Error | undefined>(undefined);
  const chatBootstrappedRef = useRef(false);
  const chatMessageCountRef = useRef(0);
  const chromeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasHadRemoteRef = useRef(false);
  const [waitingTimeoutReached, setWaitingTimeoutReached] = useState(false);

  const [cmdOpen, setCmdOpen] = useState(false);
  const [activeSnapPoint, setActiveSnapPoint] = useState<
    string | number | null
  >(0.35);

  const handleClosePanel = useCallback(() => {
    ui.setPanel("none");
  }, [ui]);

  const commands = useMemo(() => {
    const list: CommandAction[] = [
      {
        id: "toggle-mic",
        label: isMicrophoneEnabled ? "Mute Microphone" : "Unmute Microphone",
        category: "Call Controls",
        shortcut: ["M"],
        action: () => toggleMic(),
      },
      {
        id: "toggle-camera",
        label: isCameraEnabled ? "Stop Camera" : "Start Camera",
        category: "Call Controls",
        shortcut: ["V"],
        action: () => toggleCamera(),
      },
    ];

    if (onToggleFullScreen) {
      list.push({
        id: "toggle-fullscreen",
        label: isFullScreenLayout ? "Minimize Call View" : "Maximize Call View",
        category: "Call Controls",
        shortcut: ["F"],
        action: () => onToggleFullScreen(),
      });
    }

    if (showWorkspaceLayout && onWorkspaceTabChange) {
      list.push(
        {
          id: "tab-notes",
          label: "Go to Prescription Notes",
          category: "Navigation",
          shortcut: ["G", "N"],
          action: () => onWorkspaceTabChange("notes"),
        },
        {
          id: "tab-info",
          label: "Go to Patient Vitals / Info",
          category: "Navigation",
          shortcut: ["G", "I"],
          action: () => onWorkspaceTabChange("info"),
        },
        {
          id: "tab-chat",
          label: "Go to Chat",
          category: "Navigation",
          shortcut: ["G", "C"],
          action: () => onWorkspaceTabChange("chat"),
        },
      );
    }

    return list;
  }, [
    isMicrophoneEnabled,
    isCameraEnabled,
    isFullScreenLayout,
    onToggleFullScreen,
    showWorkspaceLayout,
    onWorkspaceTabChange,
  ]);

  // Quick single-key hotkeys (M, V, F) when not focused on an input element
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          active.getAttribute("contenteditable") === "true"
        ) {
          return;
        }
      }

      const key = e.key.toLowerCase();
      if (key === "m") {
        e.preventDefault();
        toggleMic();
      } else if (key === "v") {
        e.preventDefault();
        toggleCamera();
      } else if (key === "f" && onToggleFullScreen) {
        e.preventDefault();
        onToggleFullScreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleMic, toggleCamera, onToggleFullScreen]);

  useEffect(() => {
    if (remoteParticipants.length > 0) {
      setWaitingTimeoutReached(false);
      return;
    }

    const timer = setTimeout(() => {
      setWaitingTimeoutReached(true);
    }, 15000);

    return () => clearTimeout(timer);
  }, [remoteParticipants.length]);

  // ── Force chrome visible during Reconnecting on mobile ──
  useEffect(() => {
    if (
      connectionState === ConnectionState.Reconnecting ||
      connectionState === ConnectionState.Disconnected
    ) {
      setMobileChromeVisible(true);
    }
  }, [connectionState]);

  // ── 6. Track whether remote ever connected and play sound ──
  useEffect(() => {
    if (remoteParticipants.length > 0) {
      if (!hasHadRemoteRef.current) {
        void playPatientWaitingSound();
      }
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
  const localScreenShareTrack = getPublishedTrack(
    tracks.find(
      (t) => t.participant.isLocal && t.source === Track.Source.ScreenShare,
    ),
  );

  const connectionLabel = useMemo(
    () => formatConnectionState(connectionState, remoteParticipants.length),
    [connectionState, remoteParticipants.length],
  );
  const isCameraLive = isCameraEnabled;
  const canSwitchCamera =
    allowCameraSwitch &&
    isCameraEnabled &&
    videoDevices.length > 1 &&
    connectionState === ConnectionState.Connected;
  const isConnected = connectionState === ConnectionState.Connected;
  const isReconnecting = connectionState === ConnectionState.Reconnecting;
  const hasRemote = remoteParticipants.length > 0;

  // Derive contextual waiting-state message
  const remoteDroppedDescription = hasHadRemoteRef.current
    ? `${remoteLabel} disconnected — waiting to reconnect`
    : waitingTimeoutReached
      ? `${remoteLabel} has not joined the room yet. Please stay on this screen.`
      : remoteWaitingDescription;

  useEffect(() => {
    if (lastCameraError && cameraErrorRef.current !== lastCameraError) {
      cameraErrorRef.current = lastCameraError;
      notifyError(
        "Camera unavailable",
        getMediaDeviceErrorMessage(lastCameraError),
      );
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
    if (ui.activePanel === "chat") return;
    setUnreadMessages((c) => c + incomingMessages.length);
    const latest = incomingMessages[incomingMessages.length - 1];
    notifyInfo(
      `New message from ${latest.from?.name || remoteLabel}`,
      latest.message,
    );
  }, [ui.activePanel, chatMessages, remoteLabel]);

  useEffect(() => {
    if (ui.activePanel === "chat" && unreadMessages > 0) setUnreadMessages(0);
  }, [ui.activePanel, unreadMessages]);

  const scheduleChromeHide = useCallback(() => {
    if (!isMobileViewport || ui.activePanel !== "none") return;
    if (chromeHideTimerRef.current) clearTimeout(chromeHideTimerRef.current);
    chromeHideTimerRef.current = setTimeout(
      () => setMobileChromeVisible(false),
      2600,
    );
  }, [ui.activePanel, isMobileViewport]);

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
    if (ui.activePanel !== "none") {
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
  }, [
    ui.activePanel,
    isMobileViewport,
    mobileChromeVisible,
    scheduleChromeHide,
  ]);

  async function toggleCamera() {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (error) {
      notifyError("Camera update failed", getMediaDeviceErrorMessage(error));
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleMic() {
    try {
      await localParticipant.setMicrophoneEnabled(
        !isMicrophoneEnabled,
        !isMicrophoneEnabled ? LIVEKIT_AUDIO_CAPTURE_OPTIONS : undefined,
      );
    } catch (error) {
      notifyError(
        "Microphone update failed",
        getMediaDeviceErrorMessage(error),
      );
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
    if (!canSwitchCamera) return;
    setSwitchingCamera(true);
    try {
      const activeTrack = Array.from(
        localParticipant.videoTrackPublications.values(),
      )
        .map((pub) => pub.track)
        .find((track) => track !== undefined);
      const currentDeviceId =
        activeTrack?.mediaStreamTrack.getSettings().deviceId;

      const currentFacingMode = (activeTrack?.mediaStreamTrack.getSettings()
        .facingMode ||
        preferredFacingMode ||
        "user") as CameraFacingMode;
      const nextFacingMode =
        currentFacingMode === "environment" ? "user" : "environment";

      const nextDevice = getPreferredCameraDevice(
        videoDevices,
        nextFacingMode as CameraFacingMode,
        currentDeviceId,
      );
      if (nextDevice) {
        await room.switchActiveDevice("videoinput", nextDevice.deviceId);
        onFacingModeChange?.(nextFacingMode as CameraFacingMode);
      }
    } catch (error) {
      notifyError("Camera switch failed", getMediaDeviceErrorMessage(error));
    } finally {
      setSwitchingCamera(false);
    }
  }

  /* ─────────────────────────── Render ─────────────────────────── */
  return (
    <div
      className={cn(
        "overflow-hidden bg-app-bg text-white",
        className || "h-screen",
      )}
      onPointerDownCapture={() => revealMobileChrome()}
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* ── Top bar ─────────────────────────────────────────── */}
        <header
          className={cn(
            "absolute inset-x-0 top-0 z-30 transition-all duration-300 bg-gradient-to-b from-app-bg/80 via-app-bg/40 to-transparent",
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
                <p className="mt-0.5 truncate text-xs text-white/40">
                  {subtitle}
                </p>
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
                      ? "bg-state-live"
                      : isReconnecting
                        ? "bg-state-connecting animate-pulse"
                        : isConnected
                          ? "bg-state-waiting"
                          : "bg-white/30",
                  )}
                />
                {connectionLabel}
              </div>

              {/* Local network quality */}
              {hasWeakLocalSignal && isConnected && (
                <div
                  className="hidden items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-400 sm:flex"
                  title="Your connection is weak. Try switching to WiFi."
                >
                  <WifiOff className="h-3 w-3" />
                  Weak signal
                </div>
              )}

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

              {/* Prescription / Notes button (only shown if showWorkspaceLayout is true) */}
              {showWorkspaceLayout && (
                <button
                  type="button"
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95",
                    workspaceOpen && workspaceActiveTab === "notes"
                      ? "bg-white/[0.14] text-white"
                      : "bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/80",
                  )}
                  onClick={() => {
                    if (showWorkspaceLayout) {
                      if (workspaceOpen && workspaceActiveTab === "notes") {
                        setWorkspaceOpen(false);
                      } else {
                        setWorkspaceOpen(true);
                        onWorkspaceTabChange?.("notes");
                      }
                    }
                  }}
                  title="Prescription & Notes"
                >
                  <FileText className="h-4 w-4" />
                </button>
              )}

              {/* Chat */}
              <button
                type="button"
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95",
                  showWorkspaceLayout
                    ? workspaceOpen && workspaceActiveTab === "chat"
                      ? "bg-white/[0.14] text-white"
                      : "bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/80"
                    : ui.activePanel === "chat"
                      ? "bg-white/[0.14] text-white"
                      : "bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/80",
                )}
                onClick={() => ui.togglePanel("chat")}
              >
                <MessageSquare className="h-4 w-4" />
                {unreadMessages > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                ) : null}
              </button>

              {/* Info */}
              {infoContent || (showWorkspaceLayout && workspaceContent) ? (
                <button
                  type="button"
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95",
                    showWorkspaceLayout
                      ? workspaceOpen && workspaceActiveTab === "info"
                        ? "bg-white/[0.14] text-white"
                        : "bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/80"
                      : ui.activePanel === "info"
                        ? "bg-white/[0.14] text-white"
                        : "bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/80",
                  )}
                  onClick={() => ui.togglePanel("info")}
                >
                  <Info className="h-4 w-4" />
                </button>
              ) : null}

              {/* Fullscreen Toggle */}
              {onToggleFullScreen && (
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition active:scale-95 hover:bg-white/[0.10] hover:text-white/80"
                  onClick={() => {
                    if (onToggleFullScreen) onToggleFullScreen();
                    ui.toggleFullscreen();
                  }}
                  title={isFullScreenLayout ? "Minimize" : "Full screen"}
                >
                  {isFullScreenLayout ? (
                    <Minimize className="h-4 w-4" />
                  ) : (
                    <Maximize className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="mx-4 mb-2 sm:mx-6 flex items-center justify-between gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200 backdrop-blur-md shadow-sm">
              <div className="flex items-center gap-2">
                <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => _setError(null)}
                className="rounded-full p-1 hover:bg-white/10 active:bg-white/20 text-white/60 hover:text-white transition cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </header>

        {/* ── Main Workspace Layout via CallLayout ─────────────────────────── */}
        <CallLayout
          mode={ui.mode}
          panel={ui.activePanel}
          isMobileViewport={isMobileViewport}
          controls={
            <>
              {/* ── Control bar ────────────────────────────────── */}
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 transition-all duration-300 sm:px-6",
                  isMobileViewport
                    ? mobileChromeVisible
                      ? "translate-y-0 opacity-100"
                      : "translate-y-full opacity-0"
                    : "translate-y-0 opacity-100",
                )}
                style={{
                  paddingBottom:
                    "calc(1rem + env(safe-area-inset-bottom, 0px))",
                }}
              >
                <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl border border-call-border bg-panel/90 px-3 py-3 shadow-medium backdrop-blur-xl sm:gap-4 sm:px-5 transition-all duration-300 md:opacity-70 md:hover:opacity-100 md:focus-within:opacity-100 md:hover:shadow-[0_8px_32px_rgba(88,155,255,0.15)]">
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

                  {/* Fullscreen */}
                  <div className="hidden sm:block">
                    <ControlButton
                      active={false}
                      icon={isFullscreen ? Minimize : Maximize}
                      label="Fullscreen"
                      onClick={toggleFullscreen}
                      neutral
                    />
                  </div>

                  <div className="mx-0.5 hidden h-8 w-px bg-white/[0.08] sm:block" />

                  {/* Leave */}
                  <Dialog>
                    <DialogTrigger
                      render={
                        <button
                          type="button"
                          className="flex h-11 items-center gap-2 rounded-full bg-red-500 px-4 text-sm font-semibold text-white transition hover:bg-red-400 active:scale-[0.97] active:bg-red-600 disabled:opacity-60 sm:px-5"
                          disabled={endLoading}
                        />
                      }
                    >
                      <PhoneOff className="h-4 w-4" />
                      <span className="hidden sm:inline">{endLabel}</span>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md border-call-border bg-panel text-white">
                      <DialogHeader>
                        <DialogTitle className="text-xl">
                          Are you sure?
                        </DialogTitle>
                        <DialogDescription className="text-white/60">
                          This will disconnect both you and the patient from the
                          call. You can view the consultation details later from
                          your dashboard.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end border-none bg-transparent pt-0 px-0 pb-0">
                        <DialogClose
                          render={
                            <Button
                              variant="outline"
                              className="rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                            />
                          }
                        >
                          Cancel
                        </DialogClose>
                        <DialogClose
                          render={
                            <Button
                              onClick={onLeave}
                              className="rounded-xl bg-red-500 text-white hover:bg-red-600"
                            />
                          }
                        >
                          Yes, end call
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </>
          }
          video={
            <div className="absolute inset-0">
              {/* Remote video / waiting state */}
              <div className="absolute inset-0">
                {remoteScreenTrack && remoteParticipants.length > 0 ? (
                  <ParticipantTile
                    trackRef={remoteScreenTrack}
                    className="h-full w-full bg-black [&>video]:object-contain"
                    disableSpeakingIndicator
                  />
                ) : localScreenShareTrack ? (
                  <ParticipantTile
                    trackRef={localScreenShareTrack}
                    className="h-full w-full bg-black [&>video]:object-contain"
                    disableSpeakingIndicator
                  />
                ) : remoteParticipants.length > 0 ? (
                  <motion.div
                    initial={{ scale: 0.97, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      "h-full w-full transition-all duration-300 relative",
                      remoteParticipants[0]?.isSpeaking
                        ? "ring-4 ring-brand/50 ring-inset shadow-[0_0_30px_rgba(88,155,255,0.35)]"
                        : "",
                    )}
                  >
                    <ParticipantTile
                      trackRef={
                        remoteVideoTrack || {
                          participant: remoteParticipants[0],
                          source: Track.Source.Camera,
                        }
                      }
                      className="h-full w-full bg-app-bg [&>video]:object-contain"
                      disableSpeakingIndicator
                    />
                  </motion.div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_center,var(--call-surface)_0%,var(--call-bg)_70%)]">
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
                            isConnected ? "bg-state-live" : "bg-white/30",
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

              {/* Remote participant label (top-left, only when waiting) */}
              {hasRemote &&
              !remoteVideoTrack &&
              !remoteScreenTrack &&
              !localScreenShareTrack &&
              !hasWeakRemoteSignal ? (
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

              {/* ── Remote PiP preview (when screen sharing) ───────────── */}
              {(remoteScreenTrack || localScreenShareTrack) &&
              remoteParticipants.length > 0 ? (
                <motion.div
                  drag
                  dragConstraints={containerRef}
                  dragElastic={0.05}
                  dragMomentum={false}
                  className={cn(
                    "absolute z-10 cursor-grab active:cursor-grabbing touch-none",
                    isMobileViewport
                      ? "w-[28vw] min-w-[88px] max-w-[130px]"
                      : "w-[160px]",
                  )}
                  style={{
                    bottom: isMobileViewport
                      ? "calc(6.5rem + 30vw + env(safe-area-inset-bottom, 0px))"
                      : "18.5rem",
                    right: isMobileViewport ? "12px" : "20px",
                  }}
                >
                  <div className="pointer-events-none overflow-hidden rounded-xl border border-call-border bg-panel shadow-[0_8px_32px_rgba(0,0,0,0.5)] sm:rounded-2xl">
                    <div
                      className={cn(
                        "relative",
                        isMobileViewport ? "aspect-[3/4]" : "aspect-[4/3]",
                      )}
                    >
                      <ParticipantTile
                        trackRef={
                          remoteVideoTrack || {
                            participant: remoteParticipants[0],
                            source: Track.Source.Camera,
                          }
                        }
                        className="h-full w-full [&>video]:object-cover"
                      />
                    </div>
                  </div>
                </motion.div>
              ) : null}

              {/* ── Reconnecting overlay ────────────────────────── */}
              {isReconnecting && (
                <div className="absolute top-4 right-4 z-30 flex items-center gap-2 rounded-full bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Reconnecting...
                </div>
              )}

              {/* ── Local PiP preview (bottom-right) ───────────── */}
              <motion.div
                drag
                dragConstraints={containerRef}
                dragElastic={0.05}
                dragMomentum={false}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className={cn(
                  "absolute z-10 cursor-grab active:cursor-grabbing touch-none",
                  isMobileViewport
                    ? "w-[28vw] min-w-[88px] max-w-[130px]"
                    : "w-[160px]",
                )}
                style={{
                  bottom: isMobileViewport
                    ? "calc(6.5rem + env(safe-area-inset-bottom, 0px))"
                    : "6.5rem",
                  right: isMobileViewport ? "12px" : "20px",
                }}
              >
                <div className="pointer-events-none overflow-hidden rounded-xl border border-white/10 bg-panel shadow-medium sm:rounded-2xl ring-1 ring-white/10">
                  <div
                    className={cn(
                      "relative",
                      isMobileViewport ? "aspect-[3/4]" : "aspect-[4/3]",
                    )}
                  >
                    <ParticipantTile
                      trackRef={
                        localVideoTrack || {
                          participant: localParticipant,
                          source: Track.Source.Camera,
                        }
                      }
                      className="h-full w-full [&>video]:object-cover [&>video]:scale-x-[-1]"
                    />
                  </div>
                </div>
              </motion.div>
            </div>
          }
          panels={
            <>
              {/* Desktop workspace content if panel is prescription or info */}
              <div
                className={cn(
                  "absolute inset-0 transition-opacity duration-300 panel-base",
                  (ui.activePanel === "prescription" ||
                    ui.activePanel === "patient") &&
                    "gpu-accelerated",
                  ui.activePanel === "prescription" ||
                    ui.activePanel === "patient"
                    ? "opacity-100 pointer-events-auto [z-index:var(--z-panel)]"
                    : "opacity-0 pointer-events-none z-0",
                )}
              >
                {workspaceContent}
              </div>

              {/* Chat Panel */}
              <div
                className={cn(
                  "absolute inset-0 bg-panel transition-opacity duration-300 panel-base",
                  ["chat", "info"].includes(ui.activePanel) &&
                    "gpu-accelerated",
                  ui.activePanel === "chat"
                    ? "opacity-100 pointer-events-auto [z-index:var(--z-panel)]"
                    : "opacity-0 pointer-events-none z-0",
                )}
              >
                <ChatPanel
                  chatMessages={chatMessages}
                  isSending={isSending}
                  onClose={handleClosePanel}
                  remoteLabel={remoteLabel}
                  onSend={send}
                />
              </div>

              {/* Info Panel */}
              <div
                className={cn(
                  "absolute inset-0 bg-panel transition-opacity duration-300 panel-base",
                  ["chat", "info"].includes(ui.activePanel) &&
                    "gpu-accelerated",
                  ui.activePanel === "info"
                    ? "opacity-100 pointer-events-auto [z-index:var(--z-panel)]"
                    : "opacity-0 pointer-events-none z-0",
                )}
              >
                <InfoPanel
                  label={infoLabel}
                  onClose={handleClosePanel}
                  content={infoContent}
                />
              </div>
            </>
          }
        />
        <RoomAudioRenderer />
        <CommandMenu
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          commands={commands}
        />
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

const ChatPanel = React.memo(function ChatPanel({
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

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
    <div className="flex h-full flex-col min-h-0">
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
        className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4 min-h-0 flex flex-col"
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
                <p
                  className={cn(
                    "mt-1 text-[9px] font-medium text-right opacity-60",
                    isLocal ? "text-white/60" : "text-white/40",
                  )}
                >
                  {new Intl.DateTimeFormat("en-US", {
                    timeStyle: "short",
                  }).format(new Date(chatMessage.timestamp))}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/[0.06] px-4 py-3">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
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
});

/* ───────────────── Info Panel ───────────────── */

const InfoPanel = React.memo(function InfoPanel({
  label,
  content,
  onClose,
}: {
  label: string;
  content: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col min-h-0">
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
      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 flex flex-col">
        {content}
      </div>
    </div>
  );
});
