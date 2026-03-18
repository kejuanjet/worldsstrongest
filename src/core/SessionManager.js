// src/network/SessionManager.js
// Manages the 4-player session: host/join, state sync, player messaging.
// Transport layer uses WebSocket (with a simple signaling fallback for LAN via BroadcastChannel).
// The host is authoritative — clients send inputs, host sends back world state.

import { loadDesktopWebSocketServer } from "./runtime/DesktopWsAdapter.js";

// ─── Constants ────────────────────────────────────────────────────────────────

export const SESSION_ROLE   = { HOST: "HOST", CLIENT: "CLIENT", NONE: "NONE" };
export const MSG_TYPE = {
  // Host → Client
  WORLD_SNAPSHOT:    "WORLD_SNAPSHOT",    // full game state tick
  PLAYER_JOINED:     "PLAYER_JOINED",
  PLAYER_LEFT:       "PLAYER_LEFT",
  ZONE_CHANGE:       "ZONE_CHANGE",
  COMBAT_EVENT:      "COMBAT_EVENT",
  TRANSFORM_EVENT:   "TRANSFORM_EVENT",
  SESSION_READY:     "SESSION_READY",
  SESSION_CLOSED:    "SESSION_CLOSED",

  // Client → Host
  INPUT_STATE:       "INPUT_STATE",       // movement + button state
  REQUEST_TRANSFORM: "REQUEST_TRANSFORM",
  REQUEST_ATTACK:    "REQUEST_ATTACK",
  PING:              "PING",
  PONG:              "PONG",
};

const SNAPSHOT_INTERVAL_MS  = 50;    // 20Hz world state sync
const PING_INTERVAL_MS      = 2000;  // heartbeat / latency check
const MAX_PLAYERS           = 4;

// ─── SessionManager ───────────────────────────────────────────────────────────

export class SessionManager {
  constructor() {
    /** @type {"HOST" | "CLIENT" | "NONE"} */
    this.role = SESSION_ROLE.NONE;

    /** @type {string | null} */
    this.sessionId = null;

    /** @type {string} this client's UUID */
    this.localPlayerId = this._generateId();

    /** @type {number | null} this client's slot (set on join) */
    this.localSlot = null;

    // ── Host-only state ──────────────────────────────────────────────────────
    /** @type {Map<string, WebSocket>} playerId → socket (host only) */
    this._clientSockets = new Map();

    /** @type {Map<string, {slot: number, latency: number}>} playerId → metadata */
    this._clientMeta = new Map();

    /** @type {NodeJS.Timer | null} */
    this._snapshotTimer = null;

    /** @type {number} monotonically increasing sequence number for outgoing snapshots */
    this._snapshotSeq = 0;

    /** @type {NodeJS.Timer | null} */
    this._pingTimer = null;

    /** @type {WebSocketServer | null} host WebSocket server */
    this._wsServer = null;

    // ── Client-only state ────────────────────────────────────────────────────
    /** @type {WebSocket | null} */
    this._hostSocket = null;

    /** @type {number} ms round-trip */
    this.latency = 0;

    /** @type {number} last received snapshot sequence number (for desync detection) */
    this._lastSnapshotSeq = 0;

    /** @type {number} */
    this._pingSentAt = 0;

    // ── Shared ───────────────────────────────────────────────────────────────
    /** @type {Function | null} external callback: (playerId, slot) => void */
    this._onPlayerJoined = null;

    /** @type {Function | null} external callback: (playerId, slot) => void */
    this._onPlayerLeft = null;

    /** @type {Function | null} external: (snapshot) => void (client) */
    this._onSnapshot = null;

    /** @type {Function | null} external: (event) => void */
    this._onCombatEvent = null;

    /** @type {Function | null} external: (event) => void */
    this._onZoneChange = null;

    /** @type {Record<string, Function[]>} generic event bus */
    this._listeners = {};

    /** @type {boolean} */
    this.connected = false;

    /** @type {InputState | null} latest local input, sent each tick */
    this.localInputState = null;
  }

  // ─── Host ──────────────────────────────────────────────────────────────────

  /**
   * Start hosting a session.
   * In Electron, this opens a local WebSocket server.
   * In browser, falls back to BroadcastChannel (same-device testing).
   * @param {number} [port=7777]
   * @returns {Promise<string>} sessionId
   */
  async host(port = 7777) {
    this.role       = SESSION_ROLE.HOST;
    this.sessionId  = this._generateId();
    this.localSlot  = 0;   // host always takes slot 0

    console.log(`[SessionManager] Hosting session ${this.sessionId} on port ${port}`);

    if (this._isElectron()) {
      await this._startWSServer(port);
    } else {
      this._startBroadcastHost();
    }

    // Register host itself as slot 0
    this._clientMeta.set(this.localPlayerId, { slot: 0, latency: 0 });
    this.connected = true;

    this._emit("onHostReady", { sessionId: this.sessionId, port });

    return this.sessionId;
  }

  /**
   * Start the periodic world snapshot broadcast (call after world is ready).
   * @param {Function} getSnapshot  callback returning serialized world state
   */
  startSnapshotBroadcast(getSnapshot) {
    if (this.role !== SESSION_ROLE.HOST) return;
    if (this._snapshotTimer) clearInterval(this._snapshotTimer);

    this._snapshotTimer = setInterval(() => {
      const snapshot = getSnapshot();
      this.broadcastToClients({
        type:    MSG_TYPE.WORLD_SNAPSHOT,
        seq:     ++this._snapshotSeq,
        tick:    Date.now(),
        payload: snapshot,
      });
    }, SNAPSHOT_INTERVAL_MS);

    console.log(`[SessionManager] Snapshot broadcast started @ ${1000 / SNAPSHOT_INTERVAL_MS}Hz`);
  }

  stopSnapshotBroadcast() {
    if (this._snapshotTimer) {
      clearInterval(this._snapshotTimer);
      this._snapshotTimer = null;
    }
  }

  /**
   * Broadcast a message to all connected clients.
   * @param {object} msg
   */
  broadcastToClients(msg) {
    if (this.role !== SESSION_ROLE.HOST) return;
    const payload = JSON.stringify(msg);

    if (this._isElectron()) {
      for (const [, socket] of this._clientSockets) {
        if (socket.readyState === WebSocket.OPEN) socket.send(payload);
      }
    } else {
      this._bc?.postMessage({ ...msg, _from: this.localPlayerId });
    }
  }

  /**
   * Send a message to a specific client (host only).
   * @param {string} playerId
   * @param {object} msg
   */
  sendToClient(playerId, msg) {
    if (this.role !== SESSION_ROLE.HOST) return;
    const socket = this._clientSockets.get(playerId);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }

  // ─── Client ────────────────────────────────────────────────────────────────

  /**
   * Join an existing session.
   * @param {string} host   IP or hostname
   * @param {number} [port=7777]
   * @param {string} [characterId]  desired character
   */
  async join(host, port = 7777, characterId = null) {
    this.role = SESSION_ROLE.CLIENT;

    console.log(`[SessionManager] Joining ${host}:${port}`);

    const url = `ws://${host}:${port}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this._hostSocket = ws;

      ws.onopen = () => {
        console.log("[SessionManager] Connected to host.");
        // Announce ourselves
        this._sendToHost({
          type:        MSG_TYPE.PLAYER_JOINED,
          playerId:    this.localPlayerId,
          characterId: characterId,
        });
        this.connected = true;
        this._startPing();
        resolve();
      };

      ws.onmessage = (ev) => this._handleHostMessage(JSON.parse(ev.data));

      ws.onclose = () => {
        this.connected = false;
        console.warn("[SessionManager] Disconnected from host.");
        this._emit("onDisconnected", {});
      };

      ws.onerror = (err) => {
        console.error("[SessionManager] WebSocket error:", err);
        reject(err);
      };
    });
  }

  /**
   * Send the local player's input state to the host each frame.
   * @param {InputState} inputState
   */
  sendInputState(inputState) {
    this.localInputState = inputState;
    if (this.role !== SESSION_ROLE.CLIENT) return;

    this._sendToHost({
      type:     MSG_TYPE.INPUT_STATE,
      playerId: this.localPlayerId,
      slot:     this.localSlot,
      input:    inputState,
      tick:     Date.now(),
    });
  }

  requestTransform(transformId) {
    if (this.role === SESSION_ROLE.CLIENT) {
      this._sendToHost({ type: MSG_TYPE.REQUEST_TRANSFORM, playerId: this.localPlayerId, transformId });
    }
  }

  requestAttack(attackData) {
    if (this.role === SESSION_ROLE.CLIENT) {
      this._sendToHost({ type: MSG_TYPE.REQUEST_ATTACK, playerId: this.localPlayerId, ...attackData });
    }
  }

  // ─── Shared Public Callbacks ──────────────────────────────────────────────

  onPlayerJoined(fn) { this._onPlayerJoined = fn; }
  onPlayerLeft(fn)   { this._onPlayerLeft   = fn; }
  onSnapshot(fn)     { this._onSnapshot     = fn; }
  onCombatEvent(fn)  { this._onCombatEvent  = fn; }
  onZoneChange(fn)   { this._onZoneChange   = fn; }

  // ─── Event Bus ────────────────────────────────────────────────────────────

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._listeners[event] = (this._listeners[event] || []).filter(f => f !== fn);
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
    // also call named callbacks for the common ones
    if (event === "onPlayerJoined") this._onPlayerJoined?.(data.playerId, data.slot);
    if (event === "onPlayerLeft")   this._onPlayerLeft?.(data.playerId, data.slot);
  }

  // ─── Disconnect / Cleanup ─────────────────────────────────────────────────

  disconnect() {
    this.stopSnapshotBroadcast();

    if (this._pingTimer) clearInterval(this._pingTimer);

    if (this.role === SESSION_ROLE.HOST) {
      this.broadcastToClients({ type: MSG_TYPE.SESSION_CLOSED });
      this._clientSockets.forEach(ws => ws.close());
      this._clientSockets.clear();
      this._wsServer?.close?.();
    } else {
      this._hostSocket?.close();
    }

    this._bc?.close?.();
    this._bc = null;

    this.role      = SESSION_ROLE.NONE;
    this.connected = false;
    console.log("[SessionManager] Disconnected.");
  }

  // ─── Host — WebSocket Server ──────────────────────────────────────────────

  async _startWSServer(port) {
    if (!this._isElectron()) {
      throw new Error("Desktop WebSocket server is only available in Electron.");
    }
    const WebSocketServer = await loadDesktopWebSocketServer();
    if (!WebSocketServer) {
      throw new Error('Failed to load desktop WebSocket server from "ws".');
    }

    this._wsServer = new WebSocketServer({ port });

    this._wsServer.on("connection", (ws) => {
      let clientPlayerId = null;

      ws.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (e) { console.warn("[SessionManager] Malformed message from client:", e); return; }

        if (msg.type === MSG_TYPE.PLAYER_JOINED && !clientPlayerId) {
          clientPlayerId = msg.playerId;

          // Reject if full
          if (this._clientSockets.size >= MAX_PLAYERS - 1) {
            ws.send(JSON.stringify({ type: MSG_TYPE.SESSION_CLOSED, reason: "Session full" }));
            ws.close();
            return;
          }

          const slot = this._assignSlot();
          this._clientSockets.set(clientPlayerId, ws);
          this._clientMeta.set(clientPlayerId, { slot, latency: 0 });

          // Tell the joining client their slot + session id
          ws.send(JSON.stringify({
            type:      MSG_TYPE.SESSION_READY,
            sessionId: this.sessionId,
            slot,
            playerId:  clientPlayerId,
          }));

          // Tell everyone else
          this.broadcastToClients({
            type:        MSG_TYPE.PLAYER_JOINED,
            playerId:    clientPlayerId,
            slot,
            characterId: msg.characterId,
          });

          this._emit("onPlayerJoined", { playerId: clientPlayerId, slot, characterId: msg.characterId });
          console.log(`[SessionManager] Player ${clientPlayerId} joined as slot ${slot}`);
        }

        else if (msg.type === MSG_TYPE.INPUT_STATE) {
          // Forward input to game logic via event
          this._emit("onClientInput", { playerId: msg.playerId, slot: msg.slot, input: msg.input });
        }

        else if (msg.type === MSG_TYPE.REQUEST_TRANSFORM) {
          this._emit("onTransformRequest", { playerId: msg.playerId, transformId: msg.transformId });
        }

        else if (msg.type === MSG_TYPE.REQUEST_ATTACK) {
          this._emit("onAttackRequest", { playerId: msg.playerId, ...msg });
        }

        else if (msg.type === MSG_TYPE.PING) {
          ws.send(JSON.stringify({ type: MSG_TYPE.PONG, ts: msg.ts }));
        }
      });

      ws.on("close", () => {
        if (!clientPlayerId) return;
        const meta = this._clientMeta.get(clientPlayerId);
        this._clientSockets.delete(clientPlayerId);
        this._clientMeta.delete(clientPlayerId);
        this.broadcastToClients({ type: MSG_TYPE.PLAYER_LEFT, playerId: clientPlayerId, slot: meta?.slot });
        this._emit("onPlayerLeft", { playerId: clientPlayerId, slot: meta?.slot });
        console.log(`[SessionManager] Player ${clientPlayerId} left.`);
      });
    });

    console.log(`[SessionManager] WebSocket server listening on ws://0.0.0.0:${port}`);
  }

  // ─── Host — BroadcastChannel Fallback (browser dev) ─────────────────────

  _startBroadcastHost() {
    this._bc = new BroadcastChannel(`ws_session_${this.sessionId}`);
    this._bc.onmessage = ({ data }) => {
      if (data._from === this.localPlayerId) return;
      this._handleClientMessage(data._from ?? "unknown", data);
    };
    console.log("[SessionManager] BroadcastChannel host ready (dev mode).");
  }

  // ─── Client — Incoming messages from host ────────────────────────────────

  _handleHostMessage(msg) {
    switch (msg.type) {
      case MSG_TYPE.SESSION_READY:
        this.sessionId  = msg.sessionId;
        this.localSlot  = msg.slot;
        console.log(`[SessionManager] Session ready. Slot: ${msg.slot}`);
        this._emit("onSessionReady", msg);
        break;

      case MSG_TYPE.WORLD_SNAPSHOT: {
        const seq = msg.seq ?? 0;
        if (seq > 0 && seq <= this._lastSnapshotSeq) {
          // Out-of-order or duplicate — discard
          break;
        }
        if (seq > 0 && seq > this._lastSnapshotSeq + 1) {
          console.warn(`[SessionManager] Missed ${seq - this._lastSnapshotSeq - 1} snapshot(s) (seq ${this._lastSnapshotSeq} → ${seq})`);
        }
        this._lastSnapshotSeq = seq;
        this._onSnapshot?.(msg.payload);
        break;
      }

      case MSG_TYPE.PLAYER_JOINED:
        this._emit("onPlayerJoined", { playerId: msg.playerId, slot: msg.slot, characterId: msg.characterId });
        break;

      case MSG_TYPE.PLAYER_LEFT:
        this._emit("onPlayerLeft", { playerId: msg.playerId, slot: msg.slot });
        break;

      case MSG_TYPE.COMBAT_EVENT:
        this._onCombatEvent?.(msg.payload);
        this._emit("onCombatEvent", msg.payload);
        break;

      case MSG_TYPE.ZONE_CHANGE:
        this._onZoneChange?.(msg.payload);
        this._emit("onZoneChange", msg.payload);
        break;

      case MSG_TYPE.TRANSFORM_EVENT:
        this._emit("onTransformEvent", msg.payload);
        break;

      case MSG_TYPE.SESSION_CLOSED:
        console.warn("[SessionManager] Host closed the session.");
        this.disconnect();
        break;

      case MSG_TYPE.PONG:
        this.latency = (Date.now() - this._pingSentAt);
        this._emit("onLatencyUpdate", { latency: this.latency });
        break;

      default:
        console.warn("[SessionManager] Unknown message type:", msg.type);
    }
  }

  // ─── Host — process a client-originated message ──────────────────────────

  _handleClientMessage(playerId, msg) {
    // BroadcastChannel path (dev only) — same routing as ws.on("message")
    if (msg.type === MSG_TYPE.INPUT_STATE) {
      this._emit("onClientInput", { playerId, slot: msg.slot, input: msg.input });
    }
  }

  // ─── Client — send to host ─────────────────────────────────────────────

  _sendToHost(msg) {
    if (this._hostSocket?.readyState === WebSocket.OPEN) {
      this._hostSocket.send(JSON.stringify(msg));
    } else if (this._bc) {
      this._bc.postMessage({ ...msg, _from: this.localPlayerId });
    }
  }

  // ─── Ping / Latency ───────────────────────────────────────────────────────

  _startPing() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      this._pingSentAt = Date.now();
      this._sendToHost({ type: MSG_TYPE.PING, ts: this._pingSentAt });
    }, PING_INTERVAL_MS);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _assignSlot() {
    const taken = new Set([...this._clientMeta.values()].map(m => m.slot));
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!taken.has(i)) return i;
    }
    throw new Error("SessionManager: no free slots");
  }

  _isElectron() {
    return typeof window !== "undefined" &&
      typeof window.process !== "undefined" &&
      !!window.process.versions?.electron;
  }

  _generateId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

// ─── InputState ─────────────────────────────────────────────────────────────
// Serializable input snapshot sent from client → host each tick.

export class InputState {
  constructor() {
    this.moveX      = 0;     // -1 → 1 (strafe)
    this.moveZ      = 0;     // -1 → 1 (forward/back)
    this.flyY       = 0;     // -1 → 1 (ascend/descend)
    this.yaw        = 0;     // camera yaw
    this.pitch      = 0;     // camera pitch

    this.btnAttack  = false;
    this.btnKi      = false;  // charge ki
    this.btnDodge   = false;
    this.btnTransform = false;
    this.btnBlock   = false;
    this.btnUltimate = false;
  }

  /** Build from keyboard/gamepad state. */
  static fromKeys(keys, camera) {
    const s = new InputState();
    s.moveX = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);
    s.moveZ = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0);
    s.flyY  = (keys["Space"] ? 1 : 0) - (keys["ShiftLeft"] ? 1 : 0);
    s.yaw   = camera?.alpha ?? 0;
    s.pitch = camera?.beta  ?? 0;

    s.btnAttack    = !!keys["Mouse0"];
    s.btnKi        = !!keys["Mouse1"];
    s.btnDodge     = !!keys["KeyE"];
    s.btnTransform = !!keys["KeyQ"];
    s.btnBlock     = !!keys["KeyF"];
    s.btnUltimate  = !!keys["KeyR"];

    return s;
  }
}
