import { Room, RoomEvent, DisconnectReason, ConnectionState as RoomConnectionState, ConnectionQuality } from "livekit-client";
import { LIVEKIT_ROOM_OPTIONS } from "@/lib/media";
import { useCallStore } from "@/stores/call-store";
import { logEvent } from "@/lib/logger";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

class CallSessionManager {
  private room: Room | null = null;
  private pageHideListener: ((e: PageTransitionEvent) => void) | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private retryCount = 0;
  
  private tokenRefresher: ((reason?: string) => Promise<string>) | null = null;
  private serverUrl: string | null = null;
  private appointmentId: string | null = null;
  private role: "doctor" | "patient" | "public" | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private recoveryStartedAt: number | null = null;

  private sessionVersion: number | null = null;
  private isRecovering = false;
  private recoveryReason: string | null = null;
  private poorQualityTimeout: ReturnType<typeof setTimeout> | null = null;

  async connect(
    serverUrl: string,
    token: string,
    appointmentId: string,
    role: "doctor" | "patient" | "public",
    tokenRefresher?: (reason?: string) => Promise<string>
  ): Promise<void> {
    this.serverUrl = serverUrl;
    this.appointmentId = appointmentId;
    this.role = role;
    this.isDestroyed = false;
    if (tokenRefresher) {
      this.tokenRefresher = tokenRefresher;
    }

    const parsedVersion = getSessionVersionFromToken(token);
    if (parsedVersion !== null) {
      this.sessionVersion = parsedVersion;
    }

    if (this.room) {
      if (this.room.state === RoomConnectionState.Connected || this.room.state === RoomConnectionState.Connecting) {
        logEvent("call_session_connect_noop", { state: this.room.state });
        return;
      }
      logEvent("call_session_reconnect_cleanup", { state: this.room.state });
      await this.destroy();
    }

    const store = useCallStore.getState();
    store._setConnectionState("connecting");
    store._setUiPhase("connecting");
    store._setError(null);
    store._setAppointmentId(appointmentId);

    if (typeof window !== "undefined") {
      sessionStorage.setItem("activeCallId", appointmentId);
    }

    // Setup BroadcastChannel for tab conflict prevention (Active tab wins)
    if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
      this.broadcastChannel = new BroadcastChannel(`call-session-${appointmentId}`);
      
      this.broadcastChannel.onmessage = (event) => {
        if (event.data?.type === "JOIN_ATTEMPT") {
          if (this.room && (this.room.state === RoomConnectionState.Connected || this.room.state === RoomConnectionState.Connecting)) {
            // We are active, let the new tab know they cannot join
            this.broadcastChannel?.postMessage({ type: "SESSION_ACTIVE" });
          }
        } else if (event.data?.type === "SESSION_ACTIVE") {
          // Another tab is already in the call, reject this join attempt
          alert("This call is already active in another tab or window. Disconnecting this session.");
          void this.disconnect();
        }
      };

      // Broadcast our join attempt to see if any tab is active
      this.broadcastChannel.postMessage({ type: "JOIN_ATTEMPT" });
    }

    try {
      const room = new Room(LIVEKIT_ROOM_OPTIONS);
      this.room = room;
      this.retryCount = 0;

      // Event Listeners
      room.on(RoomEvent.Connected, () => {
        this.retryCount = 0;
        const currentStore = useCallStore.getState();
        currentStore._setConnectionState("connected");
        currentStore._setUiPhase("incall");
        if (!currentStore.callStartedAt) {
          currentStore._setCallStartedAt(Date.now());
        }
        currentStore._setRemoteJoined(room.remoteParticipants.size > 0);
        logEvent("room_connected");
        this.startHeartbeat();
      });

      room.on(RoomEvent.Reconnecting, () => {
        this.retryCount++;
        const currentStore = useCallStore.getState();
        currentStore._setConnectionState("reconnecting");
        currentStore._setUiPhase("reconnecting");
        logEvent("room_reconnecting", { retryCount: this.retryCount });

        if (this.retryCount > 10) {
          logEvent("room_reconnect_failed_limit");
          void this.handleHardFailure("reconnect_limit");
        }
      });

      room.on(RoomEvent.Reconnected, () => {
        this.retryCount = 0;
        const currentStore = useCallStore.getState();
        currentStore._setConnectionState("connected");
        currentStore._setUiPhase("incall");
        logEvent("room_reconnected");
      });

      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        logEvent("room_disconnected", { reason });
        if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
          logEvent("call_session_kicked_by_duplicate_identity");
        }
        const currentStore = useCallStore.getState();
        
        const terminalReasons = [
          DisconnectReason.SERVER_SHUTDOWN,
          DisconnectReason.ROOM_DELETED,
          DisconnectReason.PARTICIPANT_REMOVED
        ];
        
        if (reason !== undefined && terminalReasons.includes(reason)) {
          currentStore._setUiPhase("ended");
          void this.destroy();
        } else {
          // Trigger silent rejoin recovery since it's a non-terminal disconnect
          void this.handleHardFailure("non_terminal_disconnect");
        }
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        const currentStore = useCallStore.getState();
        currentStore._setRemoteJoined(room.remoteParticipants.size > 0);
        logEvent("participant_connected");
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        const currentStore = useCallStore.getState();
        currentStore._setRemoteJoined(room.remoteParticipants.size > 0);
        logEvent("participant_disconnected");
      });

      room.on(RoomEvent.TrackSubscribed, () => {
        const currentStore = useCallStore.getState();
        currentStore._setRemoteJoined(true);
        logEvent("track_subscribed");
      });

      // Network adaptation: mute video if connection is poor or lost
      room.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality) => {
        logEvent("room_connection_quality_changed", { quality });
        if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Unknown) {
          const currentStore = useCallStore.getState();
          currentStore._setError("Poor network quality detected. Disabling camera to conserve bandwidth.");
          if (room.localParticipant.isCameraEnabled) {
            void room.localParticipant.setCameraEnabled(false);
          }
        }

        // Trigger poor network quality recovery (wait 15 seconds)
        if (this.isRecovering) return;

        if (quality === ConnectionQuality.Poor) {
          if (!this.poorQualityTimeout) {
            logEvent("call_session_poor_quality_timer_started");
            this.poorQualityTimeout = setTimeout(() => {
              logEvent("call_session_poor_quality_threshold_reached_triggering_recovery");
              void this.handleHardFailure("poor_quality");
            }, 15000);
          }
        } else {
          if (this.poorQualityTimeout) {
            logEvent("call_session_poor_quality_timer_cleared", { quality });
            clearTimeout(this.poorQualityTimeout);
            this.poorQualityTimeout = null;
          }
        }
      });

      await room.connect(serverUrl, token);
      store._setRoom(room);

      // Unload listener for hybrid app switches vs close
      if (typeof window !== "undefined") {
        this.pageHideListener = (e: PageTransitionEvent) => {
          if (!e.persisted) {
            void this.disconnect();
          }
        };
        window.addEventListener("pagehide", this.pageHideListener);
      }

    } catch (err) {
      logEvent("room_connect_error", { error: String(err) });
      const currentStore = useCallStore.getState();
      currentStore._setError(err instanceof Error ? err.message : "Failed to connect to video room");
      currentStore._setUiPhase("prejoin");
      currentStore._setConnectionState("disconnected");
      await this.destroy();
      throw err;
    }
  }

  async publishTracks(audio: boolean, video: boolean): Promise<void> {
    if (!this.room) {
      throw new Error("Cannot publish tracks: room is not connected");
    }
    logEvent("publish_tracks_start", { audio, video });
    try {
      await this.room.localParticipant.enableCameraAndMicrophone();
      await this.room.localParticipant.setCameraEnabled(video);
      await this.room.localParticipant.setMicrophoneEnabled(audio);
      logEvent("publish_tracks_success");
    } catch (err) {
      logEvent("publish_tracks_failed", { error: String(err) });
      throw err;
    }
  }

  // Layer 2 Recovery - Zoom behavior
  private async handleHardFailure(reason?: string): Promise<void> {
    if (this.isDestroyed) return;
    if (this.isRecovering) return;

    this.isRecovering = true;
    this.recoveryReason = reason || "disconnect";

    const store = useCallStore.getState();
    if (!this.tokenRefresher || !this.serverUrl || !this.appointmentId) {
      store._setUiPhase("ended");
      store._setError("Connection lost permanently.");
      await this.destroy();
      return;
    }

    // Proactive Circuit Breaker to prevent self-DDoS during backend / LiveKit outages
    if (this.recoveryStartedAt === null) {
      this.recoveryStartedAt = Date.now();
    } else if (Date.now() - this.recoveryStartedAt > 5 * 60 * 1000) {
      logEvent("call_session_recovery_timeout_circuit_breaker");
      store._setUiPhase("ended");
      store._setError("Unable to restore connection. Please try rejoining later.");
      await this.destroy();
      return;
    }

    logEvent("call_session_hard_failure_recovery_attempt", { reason: this.recoveryReason });
    store._setUiPhase("reconnecting");
    store._setConnectionState("reconnecting");

    // Remember track configurations
    const hadVideo = this.room?.localParticipant?.isCameraEnabled ?? false;
    const hadAudio = this.room?.localParticipant?.isMicrophoneEnabled ?? false;

    // Retry recovery in bursts with 30s cooldowns until connected or destroyed
    while (!this.isDestroyed) {
      await this.destroyRoomOnly();

      let attempt = 0;
      let connected = false;
      while (attempt < 3) {
        if (this.isDestroyed) return;
        try {
          const delay = Math.min(1000 * 2 ** attempt, 10000);
          await sleep(delay);
          if (this.isDestroyed) return;
          
          const newToken = await this.tokenRefresher(this.recoveryReason || undefined);
          if (this.isDestroyed) return;

          const parsedVersion = getSessionVersionFromToken(newToken);
          if (parsedVersion !== null) {
            this.sessionVersion = parsedVersion;
          }

          await this.connect(this.serverUrl, newToken, this.appointmentId, this.role!, this.tokenRefresher);
          if (this.isDestroyed) return;
          await this.publishTracks(hadAudio, hadVideo);
          logEvent("call_session_hard_failure_recovery_success");
          this.recoveryStartedAt = null; // Reset on success
          this.isRecovering = false;
          this.recoveryReason = null;
          connected = true;
          break;
        } catch (err) {
          attempt++;
          logEvent("call_session_hard_failure_recovery_failed_attempt", { attempt, error: String(err) });
        }
      }

      if (connected || this.isDestroyed) return;

      // Bursts failed. Wait 30 seconds before next recovery cycle
      const currentStore = useCallStore.getState();
      currentStore._setError("Connection unstable. Retrying in 30 seconds...");
      currentStore._setUiPhase("reconnecting");
      
      logEvent("call_session_hard_failure_cooldown");
      await sleep(30000);
    }
  }

  private async destroyRoomOnly(): Promise<void> {
    this.stopHeartbeat();
    if (this.poorQualityTimeout) {
      clearTimeout(this.poorQualityTimeout);
      this.poorQualityTimeout = null;
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
    store._setConnectionState("disconnected");
  }

  async disconnect(): Promise<void> {
    logEvent("call_session_disconnect_request");
    const store = useCallStore.getState();
    store._setUiPhase("ended");
    await this.destroy();
  }

  getRoom(): Room | null {
    return this.room;
  }

  async destroy(): Promise<void> {
    this.isDestroyed = true;
    this.isRecovering = false;
    this.recoveryReason = null;
    this.recoveryStartedAt = null;
    if (this.poorQualityTimeout) {
      clearTimeout(this.poorQualityTimeout);
      this.poorQualityTimeout = null;
    }
    logEvent("call_session_destroy");
    
    this.stopHeartbeat();

    if (typeof window !== "undefined") {
      sessionStorage.removeItem("activeCallId");
      sessionStorage.removeItem("activeCallChoices");
      if (this.pageHideListener) {
        window.removeEventListener("pagehide", this.pageHideListener);
        this.pageHideListener = null;
      }
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
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
    store._setConnectionState("disconnected");
    store._setRemoteJoined(false);
    store._setCallStartedAt(null);
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

    logEvent("heartbeat_start", { url });

    const loop = () => {
      this.sendHeartbeat(url);
      const delay = 5000 + Math.random() * 1000;
      this.heartbeatTimeout = setTimeout(loop, delay);
    };

    // Send immediately on start
    loop();
  }

  private sendHeartbeat(url: string): void {
    // Null safety: do not send heartbeat if sessionVersion is not yet set
    if (this.sessionVersion === null) return;

    const body: Record<string, any> = {
      session_version: this.sessionVersion
    };

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      credentials: "include",
    })
      .then(async (res) => {
        if (res.status === 409) {
          // Heartbeat rejected with 409 (Outdated session version)
          if (!this.isRecovering) {
            // Debounce/retry once after 500ms before hard failure
            logEvent("heartbeat_409_detected_retrying");
            await sleep(500);
            try {
              const retryRes = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                credentials: "include",
              });
              if (retryRes.status === 409) {
                logEvent("heartbeat_409_confirmed_triggering_recovery");
                void this.handleHardFailure("heartbeat_409");
              } else {
                logEvent("heartbeat_409_resolved_on_retry");
              }
            } catch (err) {
              console.warn("Heartbeat retry network error:", err);
            }
          }
        } else if (res.status === 404) {
          // Terminal error: appointment deleted / ended / not found
          logEvent("heartbeat_404_terminal_ended");
          const store = useCallStore.getState();
          store._setUiPhase("ended");
          store._setError("Call session ended or not found.");
          void this.destroy();
        } else if (!res.ok) {
          console.warn(`Heartbeat response not OK: ${res.status}`);
        }
      })
      .catch((err) => {
        console.warn("Heartbeat network error:", err);
      });
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimeout) {
      logEvent("heartbeat_stop");
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }
}

export const callSession = new CallSessionManager();
