import { randomUUID, timingSafeEqual } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { PUPPETS } from "../config/puppets.js";
import { config, isBrowserOriginAllowed } from "./config.js";
import { normalizeControl, normalizeJoin, parseJsonMessage } from "./protocol.js";

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
    this.controllers = new Map();
    this.touchDesignerClients = new Set();
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
    const isController = role === "controller" && isBrowserOriginAllowed(request.headers.origin, request.headers.host);

    if (!isTouchDesigner && !isController) {
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

    const controller = {
      id: randomUUID(),
      puppetId: null,
      socket
    };

    this.controllers.set(controller.id, controller);
    send(socket, { type: "server.ready", controllerId: controller.id, state: this.snapshot() });
    socket.on("message", (raw) => this.receiveControllerMessage(controller, raw));
    socket.on("close", () => this.disconnectController(controller));
  }

  receiveControllerMessage(controller, raw) {
    const message = parseJsonMessage(raw.toString());
    if (message?.type === "controller.release") {
      this.releaseControllerNotes(controller);
      controller.puppetId = null;
      this.broadcastState();
      return;
    }

    const join = normalizeJoin(message);

    if (join) {
      this.assignPuppet(controller, join.puppetId);
      return;
    }

    const control = normalizeControl(message, controller.puppetId);
    if (!control) {
      send(controller.socket, { type: "server.error", code: "invalid_message" });
      return;
    }

    const puppet = PUPPETS.find((item) => item.id === controller.puppetId);
    const controls = control.midiNotes
      ? control.midiNotes.map((midiNote) => ({ ...control, midiNote, midiNotes: undefined }))
      : [control];

    controls.forEach((noteControl) => {
      this.broadcastToTouchDesigner({
        type: "puppet.control",
        timestamp: Date.now(),
        puppetId: puppet.id,
        role: puppet.role,
        midiChannel: puppet.channel,
        controllerId: controller.id,
        ...noteControl
      });
    });
  }

  assignPuppet(controller, puppetId) {
    const occupied = [...this.controllers.values()].find(
      (candidate) => candidate.id !== controller.id && candidate.puppetId === puppetId
    );

    if (occupied) {
      send(controller.socket, { type: "server.error", code: "puppet_busy", puppetId });
      return;
    }

    controller.puppetId = puppetId;
    send(controller.socket, { type: "controller.assigned", puppetId, state: this.snapshot() });
    this.broadcastState();
  }

  disconnectController(controller) {
    this.releaseControllerNotes(controller);
    this.controllers.delete(controller.id);
    this.broadcastState();
  }

  releaseControllerNotes(controller) {
    const puppet = PUPPETS.find((item) => item.id === controller.puppetId);
    if (!puppet) {
      return;
    }

    [...new Set(puppet.pads.flatMap((pad) => pad.notes))].forEach((midiNote, noteIndex) => {
      this.broadcastToTouchDesigner({
        type: "puppet.control",
        timestamp: Date.now(),
        puppetId: puppet.id,
        role: puppet.role,
        midiChannel: puppet.channel,
        controllerId: controller.id,
        event: "note_off",
        noteIndex,
        midiNote,
        velocity: 0
      });
    });
  }

  broadcastState() {
    const message = { type: "server.state", state: this.snapshot() };
    for (const controller of this.controllers.values()) {
      send(controller.socket, message);
    }
    this.broadcastToTouchDesigner(message);
  }

  broadcastToTouchDesigner(message) {
    for (const socket of this.touchDesignerClients) {
      send(socket, message);
    }
  }

  snapshot() {
    const occupiedIds = new Set(
      [...this.controllers.values()]
        .map((controller) => controller.puppetId)
        .filter(Boolean)
    );

    return {
      puppets: PUPPETS.map((puppet) => ({
        id: puppet.id,
        role: puppet.role,
        midiChannel: puppet.channel,
        color: puppet.color,
        pads: puppet.pads,
        occupied: occupiedIds.has(puppet.id)
      })),
      controllerCount: this.controllers.size,
      touchDesignerConnected: this.touchDesignerClients.size > 0
    };
  }

  startHeartbeat() {
    this.heartbeat = setInterval(() => {
      for (const socket of this.wss.clients) {
        if (!socket.isAlive) {
          socket.terminate();
          continue;
        }

        socket.isAlive = false;
        socket.ping();
      }
    }, 30000);
  }

  close() {
    clearInterval(this.heartbeat);
    for (const socket of this.wss.clients) {
      socket.terminate();
    }
    this.wss.close();
  }
}
