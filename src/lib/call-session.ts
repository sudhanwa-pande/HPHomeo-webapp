import { Room, RoomEvent, DisconnectReason, ConnectionState as RoomConnectionState, ConnectionQuality, Track, LocalVideoTrack, LocalAudioTrack, createLocalVideoTrack, createLocalAudioTrack } from "livekit-client";
import { LIVEKIT_ROOM_OPTIONS, LIVEKIT_AUDIO_CAPTURE_OPTIONS } from "@/lib/media";
import type { CameraFacingMode } from "@/lib/media";
import { useCallStore } from "@/stores/call-store";
import type { CallState } from "@/stores/call-store";
import { logEvent } from "@/lib/logger";
import { notifyError } from "@/lib/notify";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let _sessionSeq = 0;

function decodeJwt(token: string): any {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = typeof window !== "undefined"
      ? decodeURIComponent(
          window.atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        )
      : Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("Failed to decode JWT token:", e);
    return null;
  }
}

function getSessionVersionFromToken(token: string): number | null {
  try {
    const payload = decodeJwt(token);
    if (payload && typeof payload.metadata === "string") {
      const meta = JSON.parse(payload.metadata);
      return typeof meta.session_version === "number" ? meta.session_version : null;
    }
  } catch (e) {
    console.warn("Failed to extract session version from token:", e);
  }
  return null;
}

function getSessionIdFromToken(token: string): string | null {
  try {
    const payload = decodeJwt(token);
    if (payload && typeof payload.metadata === "string") {
      const meta = JSON.parse(payload.metadata);
      return typeof meta.session_id === "string" ? meta.session_id : null;
    }
  } catch (e) {
    console.warn("Failed to extract session id from token:", e);
  }
  return null;
}

function getEpochFromToken(token: string): number | null {
  try {
    const payload = decodeJwt(token);
    if (payload && typeof payload.metadata === "string") {
      const meta = JSON.parse(payload.metadata);
      return typeof meta.epoch === "number" ? meta.epoch : null;
    }
  } catch (e) {
    console.warn("Failed to extract epoch from token:", e);
  }
  return null;
}

function getTokenIdFromToken(token: string): string | null {
  try {
    const payload = decodeJwt(token);
    if (payload && typeof payload.metadata === "string") {
      const meta = JSON.parse(payload.metadata);
      return typeof meta.token_id === "string" ? meta.token_id : null;
    }
  } catch (e) {
    console.warn("Failed to extract token id from token:", e);
  }
  return null;
}

class CallSessionManager {
  private room: Room | null = null;
  private pageHideListener: ((e: PageTransitionEvent) => void) | null = null;
  private visibilityListener: (() => void) | null = null;
  private storageEventListener: ((e: StorageEvent) => void) | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private retryCount = 0;
  
  private tokenRefresher: ((reason?: string, options?: { signal?: AbortSignal }) => Promise<string>) | null = null;
  private serverUrl: string | null = null;
  private appointmentId: string | null = null;
  private role: "doctor" | "patient" | "public" | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatGraceTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private recoveryStartedAt: number | null = null;

  private sessionVersion: number | null = null;
  private isRecovering = false;
  private recoveryReason: string | null = null;

  // Cache: persists for auto-resume
  private videoDeviceId: string | undefined = undefined;
  private audioDeviceId: string | undefined = undefined;
  
  // Publish mutex
  private isPublishing = false;
  private publishStartedAt: number | null = null;
  private static readonly PUBLISH_MUTEX_TIMEOUT_MS = 15_000;
  private activePublishRoom: Room | null = null;

  // Connect deduplication
  private connectPromise: Promise<Room | null> | null = null;
  private connectingAppointmentId: string | null = null;

  private facingMode: CameraFacingMode = "user";

  private heartbeat404Count = 0;
  private static readonly HEARTBEAT_404_THRESHOLD = 5;
  private static readonly HEARTBEAT_GRACE_MS = 10_000;

  // Sequence versioning for token refresher requests during reconnect cycles
  private tokenRefreshSeq = 0;

  // Rate-limiting timestamp for visibilitychange foreground recovery triggers
  private lastForegroundRecoveryTime = 0;

  private sessionId: string = `csm-${++_sessionSeq}`;

  // Deadlock detection & token cancellation
  private connectStartedAt: number | null = null;
  private lastConnectedEventAt: number | null = null;
  private tokenAbortController: AbortController | null = null;

  // Adaptive bitrate hysteresis & flags
  private isBitrateReduced = false;
  private lastQualityChangeTime = 0;

  private isVisibilityRecovering = false;
  private heartbeatInFlight = false;
  private epoch = 1;
  private seq = 0;
  private callStateVersion = 0;
  private isTerminating = false;
  private tokenId: string | null = null;
  private lastRtt: number | null = null;
  private lastServerTime = 0;
  private isDegraded = false;
  private mediaPolicy: "normal" | "restricted" | "none" = "normal";

  private checkTerminated(): void {
    if (this.isTerminating || this.isDestroyed) {
      throw new Error("SESSION_TERMINATED");
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  updateEpoch(epoch: number): void {
    this.epoch = epoch;
    this.log("epoch_updated", { epoch });
  }

  resetSessionId(newSessionId?: string): void {
    this.sessionId = newSessionId || `csm-${++_sessionSeq}`;
    this.epoch = 1;
    this.seq = 0;
    this.log("session_reset", { sessionId: this.sessionId });
  }

  setCallState(next: CallState) {
    const version = ++this.callStateVersion;
    queueMicrotask(() => {
      if (version !== this.callStateVersion) return;
      const store = useCallStore.getState();
      store._setCallState(next);
    });
  }

  private log(event: string, payload?: Record<string, unknown>): void {
    logEvent(event, {
      ...payload,
      sessionId: this.sessionId,
      appointmentId: this.appointmentId,
      role: this.role,
      roomState: this.room?.state,
      isDestroyed: this.isDestroyed,
      isPublishing: this.isPublishing,
      isRecovering: this.isRecovering,
      videoDeviceId: this.videoDeviceId,
      audioDeviceId: this.audioDeviceId,
      tokenRefreshSeq: this.tokenRefreshSeq,
    });
  }

  async connect(
    serverUrl: string,
    token: string,
    appointmentId: string,
    role: "doctor" | "patient" | "public",
    tokenRefresher?: (reason?: string, options?: { signal?: AbortSignal }) => Promise<string>
  ): Promise<void> {
    this.checkTerminated();
    if (this.connectPromise && this.connectingAppointmentId === appointmentId) {
      this.log("connect_deduplicated", { appointmentId });
      await this.connectPromise;
      this.checkTerminated();
      return;
    }

    this.isDestroyed = false;
    this.isTerminating = false;
    this.sessionId = `csm-${++_sessionSeq}`;

    this.connectingAppointmentId = appointmentId;
    this.connectPromise = this._connectInternal(serverUrl, token, appointmentId, role, tokenRefresher);
    
    try {
      await this.connectPromise;
      this.checkTerminated();
    } finally {
      this.connectPromise = null;
      this.connectingAppointmentId = null;
    }
  }

  private async _connectInternal(
    serverUrl: string,
    token: string,
    appointmentId: string,
    role: "doctor" | "patient" | "public",
    tokenRefresher?: (reason?: string, options?: { signal?: AbortSignal }) => Promise<string>,
    recoverySeq?: number
  ): Promise<Room | null> {
    this.checkTerminated();
    // Stale sequence check
    if (recoverySeq !== undefined && recoverySeq !== this.tokenRefreshSeq) {
      this.log("connect_aborted_stale_seq", { recoverySeq, currentSeq: this.tokenRefreshSeq });
      return null;
    }

    this.connectStartedAt = Date.now();
    this.lastConnectedEventAt = null;

    this.serverUrl = serverUrl;
    this.appointmentId = appointmentId;
    this.role = role;
    if (tokenRefresher) {
      this.tokenRefresher = tokenRefresher;
    }

    const parsedVersion = getSessionVersionFromToken(token);
    const parsedSessionId = getSessionIdFromToken(token);
    const parsedEpoch = getEpochFromToken(token);
    const parsedTokenId = getTokenIdFromToken(token);

    this.log("token_parsed", { parsedSessionId, currentSessionId: this.sessionId, parsedEpoch, currentEpoch: this.epoch, parsedTokenId });

    if (parsedSessionId && parsedEpoch !== null) {
      // Enforce on client: Before connect, reject if the token has a stale epoch for this session ID
      if (parsedSessionId === this.sessionId && parsedEpoch < this.epoch) {
        this.log("token_rejected_stale_epoch", { parsedEpoch, currentEpoch: this.epoch });
        throw new Error("Stale token epoch");
      }
    }

    let shouldHardKill = false;
    if (parsedSessionId !== null && parsedEpoch !== null) {
      // When a new token arrives with a higher epoch or a new session_id, we must destroy the old room connection
      if (parsedSessionId !== this.sessionId || parsedEpoch > this.epoch) {
        shouldHardKill = true;
      }
    }

    if (parsedVersion !== null) {
      this.sessionVersion = parsedVersion;
    }
    if (parsedSessionId !== null) {
      this.sessionId = parsedSessionId;
    }
    if (parsedEpoch !== null) {
      this.epoch = parsedEpoch;
    }
    if (parsedTokenId !== null) {
      this.tokenId = parsedTokenId;
    }

    if (this.room) {
      if (!shouldHardKill && (this.room.state === RoomConnectionState.Connected || this.room.state === RoomConnectionState.Connecting)) {
        this.log("connect_noop", { state: this.room.state });
        return this.room;
      }
      this.log("connect_cleanup_existing", { state: this.room.state, shouldHardKill });
      await this.destroyRoomOnly();
      this.checkTerminated();
    }

    if (this.isDestroyed || this.isTerminating) {
      this.log("connect_aborted_destroyed");
      return null;
    }

    const store = useCallStore.getState();
    this.setCallState("connecting");
    store._setError(null);
    store._setAppointmentId(appointmentId);

    if (typeof window !== "undefined") {
      sessionStorage.setItem("activeCallId", appointmentId);
      localStorage.setItem("activeCallId", appointmentId);

      // BroadcastChannel conflict detector
      if (typeof BroadcastChannel !== "undefined") {
        if (this.broadcastChannel) {
          this.broadcastChannel.onmessage = null;
          this.broadcastChannel.close();
          this.broadcastChannel = null;
        }
        this.broadcastChannel = new BroadcastChannel(`call-session-${appointmentId}`);
        
        this.broadcastChannel.onmessage = async (event) => {
          const remoteSessionId = event.data?.sessionId;
          const remoteEpoch = typeof event.data?.epoch === "number" ? event.data.epoch : 1;

          if (event.data?.type === "JOIN_ATTEMPT") {
            if (remoteSessionId === this.sessionId) {
              if (remoteEpoch > this.epoch) {
                // Incoming tab has lost ownership warning or authority over us
                this.log("broadcast_lost_ownership_join_attempt", { remoteEpoch, localEpoch: this.epoch });
                const currentStore = useCallStore.getState();
                await this.destroy();
                currentStore._setError("Call active in another window (lost ownership)");
                notifyError("Call active in another window (lost ownership)");
                this.setCallState("ended");
              } else if (remoteEpoch < this.epoch) {
                // We have a newer epoch, tell the other tab we are active
                this.broadcastChannel?.postMessage({
                  type: "SESSION_ACTIVE",
                  sessionId: this.sessionId,
                  epoch: this.epoch
                });
              }
            } else {
              // Different session: if active, tell them we are active
              if (this.room && (this.room.state === RoomConnectionState.Connected || this.room.state === RoomConnectionState.Connecting)) {
                this.broadcastChannel?.postMessage({
                  type: "SESSION_ACTIVE",
                  sessionId: this.sessionId,
                  epoch: this.epoch
                });
              }
            }
          } else if (event.data?.type === "SESSION_ACTIVE") {
            if (remoteSessionId === this.sessionId) {
              if (remoteEpoch > this.epoch) {
                this.log("broadcast_lost_ownership_session_active", { remoteEpoch, localEpoch: this.epoch });
                const currentStore = useCallStore.getState();
                await this.destroy();
                currentStore._setError("Call active in another window (lost ownership)");
                notifyError("Call active in another window (lost ownership)");
                this.setCallState("ended");
              }
            } else {
              const currentStore = useCallStore.getState();
              await this.destroy();
              currentStore._setError("Call already active in another tab");
              notifyError("Call already active in another tab");
              this.setCallState("ended");
            }
          }
        };

        this.broadcastChannel.postMessage({
          type: "JOIN_ATTEMPT",
          sessionId: this.sessionId,
          epoch: this.epoch,
          timestamp: Date.now()
        });
      }

      // Storage event conflict detector (fallback for Safari private / special WebViews)
      if (this.storageEventListener) {
        window.removeEventListener("storage", this.storageEventListener);
        this.storageEventListener = null;
      }
      this.storageEventListener = async (e: StorageEvent) => {
        if (e.key === "activeCallId" && e.newValue === appointmentId) {
          const currentStore = useCallStore.getState();
          await this.destroy();
          currentStore._setError("Call already active in another tab");
          this.setCallState("ended");
        }
      };
      window.addEventListener("storage", this.storageEventListener);
    }

    try {
      const room = new Room(LIVEKIT_ROOM_OPTIONS);
      this.room = room;
      this.retryCount = 0;

      this.log("room_creating");

      room.on(RoomEvent.Connected, () => {
        if (this.room !== room) return;
        this.retryCount = 0;
        this.heartbeat404Count = 0;
        this.lastConnectedEventAt = Date.now();
        const currentStore = useCallStore.getState();
        this.setCallState("connected");
        currentStore._setError(null);
        if (!currentStore.callStartedAt) {
          currentStore._setCallStartedAt(Date.now());
        }
        
        const hasSubscribedTracks = Array.from(room.remoteParticipants.values()).some((p) =>
          p.getTrackPublications().some((pub) => pub.track !== undefined && pub.isSubscribed)
        );
        currentStore._setRemoteJoined(hasSubscribedTracks);
        this.log("CONNECTED");
        this.setupPeerConnectionListeners(room);
        this.startHeartbeatWithGrace();
      });

      room.on(RoomEvent.Reconnecting, () => {
        if (this.room !== room) return;
        this.retryCount++;
        const currentStore = useCallStore.getState();
        this.setCallState("reconnecting");
        this.log("room_reconnecting", { retryCount: this.retryCount });

        if (this.retryCount > 10) {
          this.log("room_reconnect_limit_exceeded");
          void this.handleHardFailure("reconnect_limit");
        }
      });

      room.on(RoomEvent.Reconnected, () => {
        if (this.room !== room) return;
        this.retryCount = 0;
        this.heartbeat404Count = 0;
        this.lastConnectedEventAt = Date.now();
        const currentStore = useCallStore.getState();
        this.setCallState("incall");
        currentStore._setError(null);
        this.log("room_reconnected");
        this.setupPeerConnectionListeners(room);
      });

      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (this.room !== room) return;
        this.log("room_disconnected", { reason });
        if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
          this.log("room_kicked_duplicate_identity");
        }
        const currentStore = useCallStore.getState();
        
        const terminalReasons = [
          DisconnectReason.SERVER_SHUTDOWN,
          DisconnectReason.ROOM_DELETED,
          DisconnectReason.PARTICIPANT_REMOVED
        ];
        
        if (reason !== undefined && terminalReasons.includes(reason)) {
          this.setCallState("ended");
          void this.destroy();
        } else {
          void this.handleHardFailure("non_terminal_disconnect");
        }
      });

      // Track remote connection state strictly via actual active subscribed tracks
      room.on(RoomEvent.TrackSubscribed, () => {
        if (this.room !== room) return;
        const currentStore = useCallStore.getState();
        currentStore._setRemoteJoined(true);
        this.log("REMOTE_JOINED", { remoteCount: room.remoteParticipants.size });
      });

      room.on(RoomEvent.TrackUnsubscribed, () => {
        if (this.room !== room) return;
        const currentStore = useCallStore.getState();
        const hasSubscribedTracks = Array.from(room.remoteParticipants.values()).some((p) =>
          p.getTrackPublications().some((pub) => pub.track !== undefined && pub.isSubscribed)
        );
        currentStore._setRemoteJoined(hasSubscribedTracks);
        this.log("track_unsubscribed", { hasSubscribedTracks });
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        if (this.room !== room) return;
        const currentStore = useCallStore.getState();
        const hasSubscribedTracks = Array.from(room.remoteParticipants.values()).some((p) =>
          p.getTrackPublications().some((pub) => pub.track !== undefined && pub.isSubscribed)
        );
        currentStore._setRemoteJoined(hasSubscribedTracks);
        this.log("participant_disconnected", { remoteCount: room.remoteParticipants.size });
      });

      room.on(RoomEvent.ConnectionQualityChanged, async (quality: ConnectionQuality) => {
        if (this.room !== room) return;
        this.log("connection_quality_changed", { quality });

        if (
          quality === ConnectionQuality.Good ||
          quality === ConnectionQuality.Excellent ||
          quality === ConnectionQuality.Unknown
        ) {
          const currentStore = useCallStore.getState();
          if (currentStore.error?.includes("network quality")) {
            currentStore._setError(null);
          }

          if (this.isBitrateReduced && Date.now() - this.lastQualityChangeTime > 8000) {
            const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
            if (camPub?.track instanceof LocalVideoTrack && !camPub.track.isMuted) {
              this.log("restoring_bitrate_good_quality");
              const sender = camPub.track.sender;
              if (sender) {
                try {
                  const parameters = sender.getParameters();
                  if (parameters.encodings && parameters.encodings[0]) {
                    delete parameters.encodings[0].maxBitrate;
                    await sender.setParameters(parameters);
                  }
                } catch (err) {
                  this.log("failed_to_restore_bitrate", { error: String(err) });
                }
              }
              this.isBitrateReduced = false;
              this.lastQualityChangeTime = Date.now();
            }
          }
        }

        if (quality === ConnectionQuality.Poor) {
          this.log("poor_quality_detected");
          const currentStore = useCallStore.getState();
          currentStore._setError("Weak network quality detected. Video quality may be reduced.");

          if (!this.isBitrateReduced && Date.now() - this.lastQualityChangeTime > 5000) {
            const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
            if (camPub?.track instanceof LocalVideoTrack && !camPub.track.isMuted) {
              this.log("reducing_bitrate_poor_quality");
              const sender = camPub.track.sender;
              if (sender) {
                try {
                  const parameters = sender.getParameters();
                  if (parameters.encodings && parameters.encodings[0]) {
                    parameters.encodings[0].maxBitrate = 150_000;
                    await sender.setParameters(parameters);
                  }
                } catch (err) {
                  this.log("failed_to_reduce_bitrate", { error: String(err) });
                }
              }
              this.isBitrateReduced = true;
              this.lastQualityChangeTime = Date.now();
            }
          }
        }
      });

      if (this.isDestroyed) {
        this.log("connect_aborted_pre_connect");
        return null;
      }

      await room.connect(serverUrl, token);
      this.checkTerminated();

      if (this.isDestroyed || this.room !== room) {
        this.log("connect_aborted_post_connect");
        try { room.removeAllListeners(); room.disconnect(true); } catch {}
        return null;
      }

      this.setupPeerConnectionListeners(room);
      store._setRoom(room);

      if (typeof window !== "undefined") {
        this.pageHideListener = (e: PageTransitionEvent) => {
          if (!e.persisted) {
            void this.disconnect();
          }
        };
        window.addEventListener("pagehide", this.pageHideListener);
      }

      // Foreground app focus recovery handler: handles muted/frozen media on mobile backgrounding
      if (typeof document !== "undefined") {
        this.visibilityListener = async () => {
          if (document.visibilityState === "visible" && this.room && this.room.state === RoomConnectionState.Connected) {
            // Guard: skip recovery if publishing or already in active recovery loop or connecting
            if (this.isPublishing || this.isRecovering || this.connectPromise) {
              this.log("visibility_recovery_skipped_due_to_active_recovery");
              return;
            }

            if (this.isVisibilityRecovering) {
              this.log("visibility_recovery_skipped_concurrent");
              return;
            }
            this.isVisibilityRecovering = true;

            try {
              // Debounce foreground recovery triggers (limit to once every 3s)
              if (Date.now() - this.lastForegroundRecoveryTime < 3000) {
                this.log("visibility_recovery_skipped_debounced");
                return;
              }
              this.lastForegroundRecoveryTime = Date.now();

              const roomRef = this.room;
              const cameraPub = roomRef.localParticipant.getTrackPublication(Track.Source.Camera);
              const micPub = roomRef.localParticipant.getTrackPublication(Track.Source.Microphone);
              
              const camTrack = cameraPub?.track;
              const micTrack = micPub?.track;

              const isCamDead = !camTrack || camTrack.mediaStreamTrack.readyState !== "live" || camTrack.mediaStreamTrack.muted;
              const isMicDead = !micTrack || micTrack.mediaStreamTrack.readyState !== "live";

              if (isCamDead || isMicDead) {
                this.log("recover_tracks_on_foreground", { isCamDead, isMicDead });

                // 1. Unpublish first & stop track to guarantee clean hardware release
                if (cameraPub?.track) {
                  try {
                    this.log("visibility_unpublishing_old_cam_track");
                    await roomRef.localParticipant.unpublishTrack(cameraPub.track);
                    cameraPub.track.stop();
                  } catch (e) {
                    console.warn("Failed to unpublish/stop camera track during visibility recovery:", e);
                  }
                }
                if (micPub?.track) {
                  try {
                    this.log("visibility_unpublishing_old_mic_track");
                    await roomRef.localParticipant.unpublishTrack(micPub.track);
                    micPub.track.stop();
                  } catch (e) {
                    console.warn("Failed to unpublish/stop mic track during visibility recovery:", e);
                  }
                }

                // 2. Give hardware time to release
                await sleep(150);

                // 3. Room instance change and publish state validation (in-flight race prevention)
                if (!roomRef || this.room !== roomRef) {
                  this.log("visibility_recovery_aborted_room_changed");
                  return;
                }
                if (this.connectPromise) {
                  this.log("visibility_recovery_blocked_connect_inflight");
                  return;
                }

                const existingCam = roomRef.localParticipant.getTrackPublication(Track.Source.Camera);
                const existingMic = roomRef.localParticipant.getTrackPublication(Track.Source.Microphone);
                if (existingCam?.track || existingMic?.track) {
                  this.log("visibility_recovery_skipped_already_published");
                  return;
                }

                // 4. Recreate and publish fresh tracks
                try {
                  const hadVideo = cameraPub?.isMuted === false || !!camTrack;
                  const hadAudio = micPub?.isMuted === false || !!micTrack;
                  await this.publishTracks(hadAudio, hadVideo, undefined, this.videoDeviceId, this.audioDeviceId);
                  this.checkTerminated();
                } catch (e) {
                  this.log("foreground_recovery_failed", { error: String(e) });
                }
              }
            } finally {
              this.isVisibilityRecovering = false;
            }
          }
        };
        document.addEventListener("visibilitychange", this.visibilityListener);
      }

      this.log("connect_complete");
      return room;

    } catch (err) {
      this.log("connect_error", { error: String(err) });
      const currentStore = useCallStore.getState();
      currentStore._setError(err instanceof Error ? err.message : "Failed to connect to video room");
      currentStore._setCallState("preview_ready");
      await this.destroyRoomOnly();
      throw err;
    }
  }

  private checkPublishMutexHealth(): boolean {
    if (
      this.isPublishing &&
      this.publishStartedAt &&
      Date.now() - this.publishStartedAt > CallSessionManager.PUBLISH_MUTEX_TIMEOUT_MS
    ) {
      this.log("publish_mutex_watchdog_triggered", {
        stuckForMs: Date.now() - this.publishStartedAt,
      });
      this.isPublishing = false;
      this.publishStartedAt = null;
      this.activePublishRoom = null;
      return true;
    }
    return false;
  }

  async publishTracks(
    audio: boolean,
    video: boolean,
    preferredFacingMode?: CameraFacingMode,
    videoDeviceId?: string,
    audioDeviceId?: string,
    preCreatedTracks?: { videoTrack?: LocalVideoTrack; audioTrack?: LocalAudioTrack }
  ): Promise<void> {
    if (this.mediaPolicy === "none" || this.mediaPolicy === "restricted") {
      this.log("publish_blocked_by_media_policy", { policy: this.mediaPolicy });
      return;
    }

    if (!this.room) {
      throw new Error("Cannot publish tracks: room is not connected");
    }

    if (videoDeviceId) {
      this.videoDeviceId = videoDeviceId;
    }
    if (audioDeviceId) {
      this.audioDeviceId = audioDeviceId;
    }

    // Device strict mode fallback: instead of blocking, use "default" if no deviceId or precreated track is specified.
    if (audio && !preCreatedTracks?.audioTrack && !this.audioDeviceId) {
      this.log("audio_device_missing_fallback_to_default");
      this.audioDeviceId = "default";
    }
    if (video && !preCreatedTracks?.videoTrack && !this.videoDeviceId) {
      this.log("video_device_missing_fallback_to_default");
      this.videoDeviceId = "default";
    }

    this.checkPublishMutexHealth();
    this.checkTerminated();

    if (this.isPublishing) {
      this.log("publish_blocked_concurrent");
      return;
    }

    this.isPublishing = true;
    this.publishStartedAt = Date.now();
    const roomRef = this.room;
    this.activePublishRoom = roomRef;

    const store = useCallStore.getState();
    this.setCallState("publishing");
    this.log("PUBLISH_START", { audio, video });

    const publishedTracks: (LocalAudioTrack | LocalVideoTrack)[] = [];

    try {
      if (preferredFacingMode) {
        this.facingMode = preferredFacingMode;
      }

      if (this.isDestroyed || this.room !== roomRef) return;

      // ── 1. Publish microphone track with usability validation & atomic unpublish ──
      if (audio) {
        let micTrack = preCreatedTracks?.audioTrack;
        if (micTrack) {
          const isUsable = micTrack.mediaStreamTrack.readyState === "live" && !micTrack.mediaStreamTrack.muted;
          if (!isUsable) {
            this.log("precreated_audio_track_dead_recreating");
            try {
              micTrack = await createLocalAudioTrack({ ...LIVEKIT_AUDIO_CAPTURE_OPTIONS, deviceId: this.audioDeviceId });
            } catch (err) {
              this.log("recreate_audio_failed", { error: String(err) });
            }
          }
        } else {
          micTrack = await createLocalAudioTrack({ ...LIVEKIT_AUDIO_CAPTURE_OPTIONS, deviceId: this.audioDeviceId });
        }

        if (this.isDestroyed || this.room !== roomRef) return;

        // Atomic replace: unpublish & stop stale micro track first to avoid leaks
        const existingMicPub = roomRef.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (existingMicPub?.track) {
          this.log("unpublishing_existing_mic_before_republish");
          try {
            await roomRef.localParticipant.unpublishTrack(existingMicPub.track);
            this.checkTerminated();
            existingMicPub.track.stop();
          } catch (e) {
            console.warn("Failed to unpublish/stop existing mic track:", e);
          }
        }

        if (micTrack) {
          await roomRef.localParticipant.publishTrack(micTrack);
          this.checkTerminated();
          publishedTracks.push(micTrack);
          this.audioDeviceId = micTrack.mediaStreamTrack.getSettings().deviceId;
          this.log("publish_audio_success", { deviceId: this.audioDeviceId });
        } else {
          throw new Error("Failed to acquire audio track for publishing");
        }
      }

      // ── 2. Publish camera track with usability validation & atomic unpublish ──
      if (video) {
        let camTrack = preCreatedTracks?.videoTrack;
        if (camTrack) {
          const isUsable = camTrack.mediaStreamTrack.readyState === "live" && !camTrack.mediaStreamTrack.muted;
          if (!isUsable) {
            this.log("precreated_video_track_dead_recreating");
            try {
              camTrack = await createLocalVideoTrack({ deviceId: this.videoDeviceId });
            } catch (err) {
              this.log("recreate_video_failed", { error: String(err) });
            }
          }
        } else {
          camTrack = await createLocalVideoTrack({ deviceId: this.videoDeviceId });
        }

        if (this.isDestroyed || this.room !== roomRef) return;

        // Atomic replace: unpublish & stop stale camera track first to avoid leaks
        const existingCamPub = roomRef.localParticipant.getTrackPublication(Track.Source.Camera);
        if (existingCamPub?.track) {
          this.log("unpublishing_existing_camera_before_republish");
          try {
            await roomRef.localParticipant.unpublishTrack(existingCamPub.track);
            this.checkTerminated();
            existingCamPub.track.stop();
          } catch (e) {
            console.warn("Failed to unpublish/stop existing camera track:", e);
          }
        }

        if (camTrack) {
          await roomRef.localParticipant.publishTrack(camTrack);
          this.checkTerminated();
          publishedTracks.push(camTrack);
          this.videoDeviceId = camTrack.mediaStreamTrack.getSettings().deviceId;
          this.log("publish_video_success", { deviceId: this.videoDeviceId });
        } else {
          throw new Error("Failed to acquire video track for publishing");
        }
      }

      if (this.room === roomRef) {
        this.setCallState("incall");
        this.log("PUBLISH_SUCCESS");
      }
    } catch (err) {
      this.log("publish_failed", { error: String(err) });
      for (const track of publishedTracks) {
        try {
          this.log("rollback_unpublishing_track", { source: track.source });
          await roomRef.localParticipant.unpublishTrack(track);
          track.stop();
        } catch (unpubErr) {
          console.warn("Failed to unpublish track during rollback:", unpubErr);
        }
      }
      this.setCallState("ended");
      store._setError(err instanceof Error ? err.message : "Failed to publish tracks");
      throw err;
    } finally {
      this.isPublishing = false;
      this.publishStartedAt = null;
      this.activePublishRoom = null;
    }
  }

  async unpublishAllTracks(): Promise<void> {
    if (!this.room) return;
    const roomRef = this.room;
    this.log("unpublishing_all_tracks_media_policy");
    const camPub = roomRef.localParticipant.getTrackPublication(Track.Source.Camera);
    const micPub = roomRef.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (camPub?.track) {
      try {
        await roomRef.localParticipant.unpublishTrack(camPub.track);
        camPub.track.stop();
      } catch (e) {
        console.warn("Failed to unpublish camera track:", e);
      }
    }
    if (micPub?.track) {
      try {
        await roomRef.localParticipant.unpublishTrack(micPub.track);
        micPub.track.stop();
      } catch (e) {
        console.warn("Failed to unpublish mic track:", e);
      }
    }
  }

  setFacingMode(mode: CameraFacingMode): void {
    this.facingMode = mode;
  }

  private async handleHardFailure(reason?: string): Promise<void> {
    if (this.isDestroyed || this.isTerminating) return;
    if (this.isDegraded) {
      this.log("recovery_blocked_degraded_mode");
      return;
    }

    // Reset publishing mutex on recovery start
    this.isPublishing = false;
    this.publishStartedAt = null;
    this.activePublishRoom = null;

    const isNoProgress =
      this.room?.state === RoomConnectionState.Connecting &&
      this.lastConnectedEventAt === null &&
      this.connectStartedAt !== null &&
      Date.now() - this.connectStartedAt > 15000;
    
    const hasActiveMedia = Array.from(this.room?.remoteParticipants.values() || [])
      .some((p) => p.getTrackPublications().some((pub) => pub.isSubscribed && pub.track));

    const isPeerConnectionAlive =
      (this.room as any)?.engine?.pcManager?.publisher?.connectionState === "connected";

    const forceRecovery = isNoProgress && !hasActiveMedia && !isPeerConnectionAlive;
    
    // Strict recovery filters
    if (forceRecovery) {
      this.log("forcing_recovery_from_stuck_connecting");
    }

    if (!forceRecovery && (
      this.isPublishing ||
      this.connectPromise ||
      (this.room && this.room.state !== RoomConnectionState.Disconnected)
    )) {
      this.log("recovery_skipped_active_session", {
        reason,
        isPublishing: this.isPublishing,
        hasConnectPromise: !!this.connectPromise,
        roomState: this.room?.state
      });
      return;
    }

    if (this.isRecovering) return;

    this.isRecovering = true;
    this.recoveryReason = reason || "disconnect";

    const store = useCallStore.getState();
    if (!this.tokenRefresher || !this.serverUrl || !this.appointmentId) {
      this.setCallState("ended");
      store._setError("Connection lost permanently.");
      await this.destroy();
      return;
    }

    // Proactive status check: stop recovery if backend indicates call has ended (Server-Authoritative Gate)
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const prefix = this.role === "public" ? "public" : this.role === "patient" ? "patient" : "doctor";
    const statusUrl = `${baseUrl}/${prefix}/appointments/${this.appointmentId}`;
    try {
      const statusRes = await fetch(statusUrl, { credentials: "include" });
      this.checkTerminated();
      if (statusRes.ok) {
        const aptData = await statusRes.json();
        this.checkTerminated();
        if (aptData && aptData.call_status === "ended") {
          this.log("recovery_aborted_server_ended");
          this.setCallState("ended");
          await this.destroy();
          return;
        }
      }
    } catch (statusErr) {
      this.log("recovery_status_check_failed", { error: String(statusErr) });
    }

    if (this.recoveryStartedAt === null) {
      this.recoveryStartedAt = Date.now();
    } else if (Date.now() - this.recoveryStartedAt > 5 * 60 * 1000) {
      this.log("recovery_circuit_breaker");
      this.setCallState("ended");
      store._setError("Unable to restore connection. Please try rejoining later.");
      await this.destroy();
      return;
    }

    this.log("recovery_start", { reason: this.recoveryReason });
    this.setCallState("reconnecting");

    // Capture currently active device IDs
    if (this.room) {
      const activeVideoTrack = this.room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      if (activeVideoTrack) {
        const activeVideoId = activeVideoTrack.mediaStreamTrack.getSettings().deviceId;
        if (activeVideoId) {
          this.videoDeviceId = activeVideoId;
        }
      }
      const activeAudioTrack = this.room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (activeAudioTrack) {
        const activeAudioId = activeAudioTrack.mediaStreamTrack.getSettings().deviceId;
        if (activeAudioId) {
          this.audioDeviceId = activeAudioId;
        }
      }
    }

    const hadVideo = !!this.videoDeviceId;
    const hadAudio = !!this.audioDeviceId;

    let totalAttempts = 0;
    while (!this.isDestroyed && totalAttempts < 20) {
      totalAttempts++;
      await this.destroyRoomOnly();

      let attempt = 0;
      let connected = false;
      while (attempt < 3) {
        if (this.isDestroyed) {
          this.log("recovery_aborted_destroyed", { attempt });
          this.isRecovering = false;
          this.recoveryReason = null;
          return;
        }
        try {
          const delay = Math.min(1000 * 2 ** attempt, 10000) + Math.random() * 500;
          await sleep(delay);
          if (this.isDestroyed) {
            this.isRecovering = false;
            this.recoveryReason = null;
            return;
          }
          
          // Token refresh sequence version check to prevent out-of-order token overwrite loops
          const currentSeq = ++this.tokenRefreshSeq;

          this.tokenAbortController?.abort();
          this.tokenAbortController = new AbortController();
          const currentSignal = this.tokenAbortController.signal;

          let newToken: string;
          try {
            newToken = await this.tokenRefresher(this.recoveryReason || undefined, { signal: currentSignal });
          } finally {
            if (this.tokenAbortController?.signal === currentSignal) {
              this.tokenAbortController = null;
            }
          }
          
          if (this.isDestroyed || currentSeq !== this.tokenRefreshSeq) {
            this.log("recovery_token_stale", { attempt, currentSeq, latestSeq: this.tokenRefreshSeq });
            this.isRecovering = false;
            this.recoveryReason = null;
            return;
          }

          const parsedVersion = getSessionVersionFromToken(newToken);
          if (parsedVersion !== null) {
            this.sessionVersion = parsedVersion;
          }

          const connectedRoom = await this._connectInternal(
            this.serverUrl!,
            newToken,
            this.appointmentId!,
            this.role!,
            this.tokenRefresher!,
            currentSeq
          );
          this.checkTerminated();
          if (this.isDestroyed) {
            this.isRecovering = false;
            this.recoveryReason = null;
            return;
          }
          if (this.room !== connectedRoom) {
            this.log("recovery_room_lock_race_detected");
            this.isRecovering = false;
            this.recoveryReason = null;
            return;
          }

          await this.publishTracks(hadAudio, hadVideo);
          this.checkTerminated();
          this.log("recovery_success");
          
          store._setError(null);
          
          this.recoveryStartedAt = null;
          this.isRecovering = false;
          this.recoveryReason = null;
          connected = true;
          break;
        } catch (err) {
          if (err instanceof Error && (err.name === "AbortError" || err.name === "CanceledError" || err.message === "canceled")) {
            this.log("recovery_token_refresh_aborted");
            return;
          }
          attempt++;
          this.log("recovery_attempt_failed", { attempt, error: String(err) });
        }
      }

      if (connected || this.isDestroyed) {
        if (!connected) {
          this.isRecovering = false;
          this.recoveryReason = null;
        }
        return;
      }

      const currentStore = useCallStore.getState();
      currentStore._setError("Connection unstable. Retrying in 30 seconds...");
      this.setCallState("reconnecting");
      
      this.log("recovery_cooldown");
      await sleep(30000);
    }

    if (totalAttempts >= 20 && !this.isDestroyed) {
      this.log("recovery_max_attempts_reached");
      const store = useCallStore.getState();
      this.setCallState("ended");
      store._setError("Unable to restore connection. Maximum recovery attempts reached.");
      await this.destroy();
      return;
    }

    this.isRecovering = false;
    this.recoveryReason = null;
  }

  private setupPeerConnectionListeners(room: Room): void {
    const pcManager = (room as any).engine?.pcManager;
    if (pcManager) {
      const pub = pcManager.publisher;
      const sub = pcManager.subscriber;
      if (pub) {
        pub.onConnectionStateChange = (state: string) => {
          this.log("webrtc_publisher_state_change", { state });
          if (state === "failed") {
            this.log("webrtc_publisher_failed_triggering_recovery");
            void this.handleHardFailure("webrtc_failed");
          }
        };
      }
      if (sub) {
        sub.onConnectionStateChange = (state: string) => {
          this.log("webrtc_subscriber_state_change", { state });
          if (state === "failed") {
            this.log("webrtc_subscriber_failed_triggering_recovery");
            void this.handleHardFailure("webrtc_failed");
          }
        };
      }
    }
  }

  private async destroyRoomOnly(): Promise<void> {
    this.stopHeartbeat();
    this.heartbeatInFlight = false;
    
    // Deregister visibility listener
    if (typeof document !== "undefined" && this.visibilityListener) {
      document.removeEventListener("visibilitychange", this.visibilityListener);
      this.visibilityListener = null;
    }

    if (this.room) {
      try {
        this.room.removeAllListeners();
        this.room.disconnect(true);
      } catch (err) {
        console.warn("Error disconnecting room:", err);
      }
      this.room = null;
    }
    const store = useCallStore.getState();
    store._setRoom(null);
  }

  async disconnect(): Promise<void> {
    this.log("disconnect_request");
    const store = useCallStore.getState();
    this.setCallState("ended");
    await this.destroy();
  }

  getRoom(): Room | null {
    return this.room;
  }

  async destroy(): Promise<void> {
    this.isTerminating = true;
    this.isDestroyed = true;
    this.isRecovering = false;
    this.recoveryReason = null;
    this.recoveryStartedAt = null;
    this.heartbeat404Count = 0;
    this.isPublishing = false;
    this.publishStartedAt = null;
    this.activePublishRoom = null;
    this.connectPromise = null;
    this.connectingAppointmentId = null;
    
    // Reset deadlock/concurrency states
    this.connectStartedAt = null;
    this.lastConnectedEventAt = null;
    this.isBitrateReduced = false;
    this.heartbeatInFlight = false;
    this.epoch = 1;
    this.seq = 0;
    this.callStateVersion = 0;

    // Reset token refresh abort controller
    this.tokenAbortController?.abort();
    this.tokenAbortController = null;

    this.log("destroy");
    
    this.stopHeartbeat();

    if (typeof window !== "undefined") {
      sessionStorage.removeItem("activeCallId");
      localStorage.removeItem("activeCallId");
      if (this.storageEventListener) {
        window.removeEventListener("storage", this.storageEventListener);
        this.storageEventListener = null;
      }
      if (this.pageHideListener) {
        window.removeEventListener("pagehide", this.pageHideListener);
        this.pageHideListener = null;
      }
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.onmessage = null;
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    if (typeof document !== "undefined" && this.visibilityListener) {
      document.removeEventListener("visibilitychange", this.visibilityListener);
      this.visibilityListener = null;
    }

    if (this.room) {
      try {
        this.room.removeAllListeners();
        this.room.disconnect(true);
      } catch (err) {
        console.warn("Error disconnecting room:", err);
      }
      this.room = null;
    }

    const store = useCallStore.getState();
    store._setRoom(null);
    store._setRemoteJoined(false);
    store._setCallStartedAt(null);
  }

  resetDeviceCache(): void {
    this.videoDeviceId = undefined;
    this.audioDeviceId = undefined;
    this.log("device_cache_reset");
  }

  private startHeartbeatWithGrace(): void {
    if (this.heartbeatTimeout || this.heartbeatGraceTimeout) return;

    const appointmentId = this.appointmentId;
    const role = this.role;
    if (!appointmentId || !role) {
      console.warn("Cannot start heartbeat: missing appointmentId or role");
      return;
    }

    this.log("heartbeat_grace_start", { delayMs: CallSessionManager.HEARTBEAT_GRACE_MS });

    this.heartbeatGraceTimeout = setTimeout(() => {
      this.heartbeatGraceTimeout = null;
      if (this.isDestroyed) return;
      this.startHeartbeat();
    }, CallSessionManager.HEARTBEAT_GRACE_MS);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimeout) return;

    const appointmentId = this.appointmentId;
    const role = this.role;
    if (!appointmentId || !role) {
      console.warn("Cannot start heartbeat: missing appointmentId or role");
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const prefix = role === "public" ? "public" : role === "patient" ? "patient" : "doctor";
    const url = `${baseUrl}/${prefix}/appointments/${appointmentId}/call/heartbeat`;

    this.log("heartbeat_start", { url });

    const loop = () => {
      void this.sendHeartbeat(url);
      const delay = 5000 + Math.random() * 1000;
      this.heartbeatTimeout = setTimeout(loop, delay);
    };

    loop();
  }

  private async sendHeartbeat(url: string): Promise<void> {
    if (this.isTerminating || this.isDestroyed) return;
    if (this.sessionVersion === null) return;
    if (this.heartbeatInFlight) {
      this.log("heartbeat_skipped_in_flight");
      return;
    }
    this.heartbeatInFlight = true;

    const body: Record<string, any> = {
      session_version: this.sessionVersion,
      session_id: this.sessionId,
      epoch: this.epoch,
      seq: this.seq,
      token_id: this.tokenId,
      sent_at: Date.now() / 1000,
      rtt: this.lastRtt
    };

    const startTime = Date.now();

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        credentials: "include",
      });
      this.checkTerminated();

      const rtt = Date.now() - startTime;
      this.lastRtt = rtt;

      if (res.ok || res.status === 202) {
        this.heartbeat404Count = 0;
        this.seq++; // Increment sequence count only on successful heartbeat response

        try {
          const data = await res.json();
          this.checkTerminated();
          if (data) {
            // Monotonic check
            if (typeof data.server_time === "number") {
              if (data.server_time < this.lastServerTime) {
                this.log("heartbeat_out_of_order_ignored", { serverTime: data.server_time, lastServerTime: this.lastServerTime });
                return;
              }
              this.lastServerTime = data.server_time;
            }

            // Degraded mode flag
            if (data.mode) {
              this.isDegraded = data.mode === "degraded";
            }

            // Media policy check
            if (data.media_policy) {
              this.mediaPolicy = data.media_policy;
              if (this.mediaPolicy === "none" || this.mediaPolicy === "restricted") {
                this.log("heartbeat_media_restricted", { policy: this.mediaPolicy });
                void this.unpublishAllTracks();
              }
            }

            // Handle control plane terminate instruction (e.g. fenced out, or call ended)
            if (data.terminate === true || data.status === "terminated") {
              this.log("heartbeat_terminate_requested", { data });
              this.setCallState("ended");
              notifyError("Connection terminated by server");
              void this.destroy();
              return;
            }

            // Tab A MUST die instantly if another tab (with higher epoch) has taken ownership
            if (typeof data.epoch === "number" && data.epoch > this.epoch) {
              this.log("heartbeat_lost_ownership", { serverEpoch: data.epoch, localEpoch: this.epoch });
              const store = useCallStore.getState();
              store._setError("Call active in another window (lost ownership)");
              notifyError("Call active in another window (lost ownership)");
              this.setCallState("ended");
              void this.destroy();
              return;
            }

            // Ignore smaller epochs
            if (typeof data.epoch === "number" && data.epoch < this.epoch) {
              this.log("heartbeat_stale_epoch_ignored", { serverEpoch: data.epoch, localEpoch: this.epoch });
              return;
            }

            // Handle control plane kill-switch fallback
            if (data.reconnect?.strategy === "client_only") {
              this.log("heartbeat_control_plane_kill_switch_fallback");
            }

            // Handle server call completion
            if (data.call_status === "ended" || data.call_status === "completed") {
              const returnedVersion = typeof data.session_version === "number" ? data.session_version : null;
              if (returnedVersion === null || returnedVersion >= this.sessionVersion) {
                this.log("heartbeat_server_ended_pending_confirmation", { call_status: data.call_status, returnedVersion, currentVersion: this.sessionVersion });
                
                await sleep(1000);
                this.checkTerminated();
                try {
                  const confirmRes = await fetch(url, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                    credentials: "include",
                  });
                  this.checkTerminated();
                  if (confirmRes.ok || confirmRes.status === 202) {
                    const confirmData = await confirmRes.json();
                    this.checkTerminated();
                    if (confirmData && (confirmData.call_status === "ended" || confirmData.call_status === "completed" || confirmData.terminate === true)) {
                      this.log("heartbeat_terminal_confirmed", { call_status: confirmData.call_status });
                      this.setCallState("ended");
                      void this.destroy();
                    }
                  }
                } catch (confirmErr) {
                  this.log("heartbeat_confirmation_failed", { error: String(confirmErr) });
                }
              }
            }
          }
        } catch (e) {
          // Safe ignore if response is empty or not JSON
        }
      } else if (res.status === 409) {
        if (!this.isRecovering) {
          this.log("heartbeat_409_retrying");
          await sleep(500);
          this.checkTerminated();
          try {
            const retryRes = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
              credentials: "include",
            });
            this.checkTerminated();
            if (retryRes.status === 409) {
              this.log("heartbeat_409_confirmed");
              void this.handleHardFailure("heartbeat_409");
            } else {
              this.log("heartbeat_409_resolved");
            }
          } catch (err) {
            console.warn("Heartbeat retry network error:", err);
          }
        }
      } else if (res.status === 404) {
        this.heartbeat404Count++;
        this.log("heartbeat_404", { consecutiveCount: this.heartbeat404Count });

        if (this.heartbeat404Count >= CallSessionManager.HEARTBEAT_404_THRESHOLD) {
          this.log("heartbeat_404_terminal");
          const store = useCallStore.getState();
          this.setCallState("ended");
          store._setError("Call session ended or not found.");
          void this.destroy();
        }
      } else {
        console.warn(`Heartbeat response not OK: ${res.status}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message === "SESSION_TERMINATED") {
        throw err;
      }
      console.warn("Heartbeat network error:", err);
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatGraceTimeout) {
      clearTimeout(this.heartbeatGraceTimeout);
      this.heartbeatGraceTimeout = null;
    }
    if (this.heartbeatTimeout) {
      this.log("heartbeat_stop");
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }
}

export const callSession = new CallSessionManager();
