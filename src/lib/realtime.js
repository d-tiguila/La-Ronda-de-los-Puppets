import { randomUUID, timingSafeEqual } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { INSTRUMENTS, INSTRUMENT_BY_ID, findChord } from "../config/instruments.js";
import { config, isBrowserOriginAllowed } from "./config.js";
import {
  normalizeControllerJoin,
  normalizeControllerMotion,
  normalizeStageTrigger,
  parseJsonMessage
} from "./protocol.js";

const NOTE_DURATION_MS = 220;
const TRIGGER_COOLDOWN_MS = 320;
const USER_TIMEOUT_MS = 2500;
const USER_REMOVE_MS = 4200;
const HEARTBEAT_INTERVAL_MS = 1000;
const MOTION_ACTIVITY_THRESHOLD = 0.18;

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function tokenMatches(candidate) {
  if (!config.tdToken) {
    return !config.isProduction;
  }

  if (!candidate) {
    return false;
  }

  const expected = Buffer.from(config.tdToken);
  const received = Buffer.from(candidate);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export class RealtimeHub {
  constructor(server) {
    this.users = new Map();
    this.controllers = new Map();
    this.stageClients = new Set();
    this.touchDesignerClients = new Set();
    this.demoLastTriggers = new Map();
    this.paused = false;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

    server.on("upgrade", (request, socket, head) => this.upgrade(request, socket, head));
    this.wss.on("connection", (socket, request, client) => this.connect(socket, request, client));
  }

  upgrade(request, socket, head) {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const role = url.searchParams.get("role");
    const isTouchDesigner = role === "touchdesigner" && tokenMatches(url.searchParams.get("token"));
    const isBrowserRole = (role === "controller" || role === "stage")
      && isBrowserOriginAllowed(request.headers.origin, request.headers.host);

    if (!isTouchDesigner && !isBrowserRole) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (webSocket) => {
      this.wss.emit("connection", webSocket, request, { role });
    });
  }

  connect(socket, _request, client) {
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    if (client.role === "touchdesigner") {
      this.touchDesignerClients.add(socket);
      send(socket, { type: "server.ready", state: this.snapshot() });
      socket.on("close", () => this.touchDesignerClients.delete(socket));
      return;
    }

    if (client.role === "stage") {
      this.stageClients.add(socket);
      send(socket, { type: "server.ready", state: this.snapshot() });
      socket.on("message", (raw) => this.receiveStageMessage(socket, raw));
      socket.on("close", () => this.stageClients.delete(socket));
      return;
    }

    const controller = {
      id: randomUUID(),
      userId: null,
      socket
    };

    this.controllers.set(controller.id, controller);
    send(socket, {
      type: "server.ready",
      controllerId: controller.id,
      instruments: INSTRUMENTS,
      state: this.snapshot()
    });
    socket.on("message", (raw) => this.receiveControllerMessage(controller, raw));
    socket.on("close", () => this.disconnectController(controller));
  }

  receiveControllerMessage(controller, raw) {
    const message = parseJsonMessage(raw.toString());
    const join = normalizeControllerJoin(message);

    if (join) {
      this.createOrUpdateUser(controller, join.instrumentId, join.chordId);
      return;
    }

    const motion = normalizeControllerMotion(message);
    if (motion && controller.userId) {
      this.updateUserMotion(controller.userId, motion);
      return;
    }

    if (message?.type === "user.leave") {
      this.disconnectController(controller);
      return;
    }

    send(controller.socket, { type: "server.error", code: "invalid_message" });
  }

  receiveStageMessage(socket, raw) {
    const message = parseJsonMessage(raw.toString());

    if (message?.type === "stage.pause") {
      this.paused = Boolean(message.paused);
      this.broadcastState();
      return;
    }

    const trigger = normalizeStageTrigger(message);

    if (!trigger) {
      send(socket, { type: "server.error", code: "invalid_stage_message" });
      return;
    }

    if (trigger.userId) {
      this.triggerUserSound(trigger.userId);
      return;
    }

    this.triggerDemoSound(trigger.demo);
  }

  createOrUpdateUser(controller, instrumentId, chordId) {
    const instrument = INSTRUMENT_BY_ID.get(instrumentId);
    const chord = findChord(instrument, chordId);
    const userId = controller.userId ?? randomUUID();
    const existing = this.users.get(userId);
    const user = {
      id: userId,
      controllerId: controller.id,
      instrumentId: instrument.id,
      instrumentLabel: instrument.label,
      midiChannel: instrument.channel,
      chordId: chord.id,
      chordLabel: chord.label,
      midiNotes: chord.notes,
      color: instrument.color,
      energy: existing?.energy ?? 0.55,
      shake: existing?.shake ?? 0,
      tiltX: existing?.tiltX ?? 0,
      tiltY: existing?.tiltY ?? 0,
      alive: true,
      lastMotionAt: Date.now(),
      lastTriggerAt: 0
    };

    controller.userId = userId;
    this.users.set(userId, user);
    send(controller.socket, { type: "user.assigned", user, instruments: INSTRUMENTS });
    this.broadcastState();
  }

  updateUserMotion(userId, motion) {
    const user = this.users.get(userId);
    if (!user) {
      return;
    }

    const now = Date.now();
    // Liveness should follow recent real motion, not smoothed visual energy.
    const hasActiveGesture = motion.shake > MOTION_ACTIVITY_THRESHOLD;

    Object.assign(user, {
      energy: user.energy * 0.72 + motion.energy * 0.28,
      shake: user.shake * 0.6 + motion.shake * 0.4,
      tiltX: user.tiltX * 0.78 + motion.tiltX * 0.22,
      tiltY: user.tiltY * 0.78 + motion.tiltY * 0.22,
      alive: hasActiveGesture || now - user.lastMotionAt < USER_TIMEOUT_MS,
      lastMotionAt: hasActiveGesture ? now : user.lastMotionAt
    });

    this.broadcastState();
  }

  triggerUserSound(userId) {
    const user = this.users.get(userId);
    const now = Date.now();

    if (!user || !user.alive || now - user.lastTriggerAt < TRIGGER_COOLDOWN_MS) {
      return;
    }

    user.lastTriggerAt = now;
    const velocity = Math.max(18, Math.min(127, Math.round(40 + user.energy * 87)));
    this.sendMidiChord(user, "note_on", velocity);
    this.broadcastToStage({ type: "bubble.pulse", userId, velocity });

    setTimeout(() => {
      this.sendMidiChord(user, "note_off", 0);
    }, NOTE_DURATION_MS);
  }

  triggerDemoSound(demo) {
    const now = Date.now();
    const lastTriggerAt = this.demoLastTriggers.get(demo.id) ?? 0;

    if (now - lastTriggerAt < TRIGGER_COOLDOWN_MS) {
      return;
    }

    this.demoLastTriggers.set(demo.id, now);
    const velocity = Math.max(28, Math.min(104, Math.round(38 + demo.energy * 66)));
    this.sendMidiChord(demo, "note_on", velocity);
    this.broadcastToStage({ type: "bubble.pulse", userId: demo.id, velocity });

    setTimeout(() => {
      this.sendMidiChord(demo, "note_off", 0);
    }, NOTE_DURATION_MS);
  }

  sendMidiChord(user, event, velocity) {
    user.midiNotes.forEach((midiNote) => {
      this.broadcastToTouchDesigner({
        type: "puppet.control",
        timestamp: Date.now(),
        puppetId: user.instrumentId,
        role: user.instrumentLabel,
        midiChannel: user.midiChannel,
        controllerId: user.controllerId,
        event,
        chordId: user.chordId,
        chordLabel: user.chordLabel,
        midiNote,
        velocity
      });
    });
  }

  disconnectController(controller) {
    if (controller.userId) {
      const user = this.users.get(controller.userId);
      if (user) {
        this.sendMidiChord(user, "note_off", 0);
      }
      this.users.delete(controller.userId);
    }

    this.controllers.delete(controller.id);
    this.broadcastState();
  }

  broadcastState() {
    const message = { type: "server.state", state: this.snapshot() };
    for (const controller of this.controllers.values()) {
      send(controller.socket, message);
    }
    this.broadcastToStage(message);
    this.broadcastToTouchDesigner(message);
  }

  broadcastToStage(message) {
    for (const socket of this.stageClients) {
      send(socket, message);
    }
  }

  broadcastToTouchDesigner(message) {
    for (const socket of this.touchDesignerClients) {
      send(socket, message);
    }
  }

  pruneInactiveUsers() {
    const now = Date.now();
    let changed = false;

    for (const [userId, user] of this.users) {
      if (now - user.lastMotionAt > USER_TIMEOUT_MS) {
        user.alive = false;
        user.energy = Math.max(0, user.energy - 0.08);
        changed = true;
      }

      if (now - user.lastMotionAt > USER_REMOVE_MS) {
        this.users.delete(userId);
        changed = true;
      }
    }

    if (changed) {
      this.broadcastState();
    }
  }

  snapshot() {
    return {
      instruments: INSTRUMENTS,
      users: [...this.users.values()].map((user) => ({
        id: user.id,
        instrumentId: user.instrumentId,
        instrumentLabel: user.instrumentLabel,
        midiChannel: user.midiChannel,
        chordId: user.chordId,
        chordLabel: user.chordLabel,
        midiNotes: user.midiNotes,
        color: user.color,
        energy: user.energy,
        shake: user.shake,
        tiltX: user.tiltX,
        tiltY: user.tiltY,
        alive: user.alive
      })),
      controllerCount: this.controllers.size,
      stageConnected: this.stageClients.size > 0,
      touchDesignerConnected: this.touchDesignerClients.size > 0,
      paused: this.paused
    };
  }

  startHeartbeat() {
    this.heartbeat = setInterval(() => {
      this.pruneInactiveUsers();

      for (const socket of this.wss.clients) {
        if (!socket.isAlive) {
          socket.terminate();
          continue;
        }

        socket.isAlive = false;
        socket.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  close() {
    clearInterval(this.heartbeat);
    for (const socket of this.wss.clients) {
      socket.terminate();
    }
    this.wss.close();
  }
}
