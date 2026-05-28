const instrumentGrid = document.querySelector("#instrumentGrid");
const motionPanel = document.querySelector("#motionPanel");
const motionButton = document.querySelector("#motionButton");
const socketDot = document.querySelector("#socketDot");
const socketLabel = document.querySelector("#socketLabel");
const stageState = document.querySelector("#stageState");
const assignedTitle = document.querySelector("#assignedTitle");
const assignedNote = document.querySelector("#assignedNote");
const orbPreview = document.querySelector("#orbPreview");
const energyFill = document.querySelector("#energyFill");
const motionHint = document.querySelector("#motionHint");
const notice = document.querySelector("#notice");

let socket;
let instruments = [];
let assignedUser = null;
let reconnectTimer = null;
let fallbackPulse = 0;
let lastMotionSentAt = 0;

function socketUrl() {
  const url = new URL("/ws?role=controller", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

function setSocketStatus(label, className) {
  socketLabel.textContent = label;
  socketDot.className = `dot ${className}`;
}

function setNotice(message) {
  notice.textContent = message;
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

// Build the instrument picker from the server state so Ableton channel changes stay centralized.
function renderInstruments() {
  instrumentGrid.replaceChildren();

  instruments.forEach((instrument) => {
    const button = document.createElement("button");
    button.className = "instrument-card";
    button.type = "button";
    button.style.setProperty("--instrument-color", instrument.color);
    button.innerHTML = `
      <span class="instrument-dot"></span>
      <strong>${instrument.label}</strong>
      <span>Canal MIDI ${instrument.channel}</span>
    `;
    button.addEventListener("click", () => {
      send({ type: "user.join", instrumentId: instrument.id });
    });
    instrumentGrid.append(button);
  });
}

// Reflect the assigned sound bubble on the phone so the participant knows they are live.
function renderAssignedUser(user) {
  assignedUser = user;
  motionPanel.hidden = false;
  orbPreview.style.setProperty("--instrument-color", user.color);
  assignedTitle.textContent = user.instrumentLabel;
  assignedNote.textContent = `Nota MIDI ${user.midiNote}. Agita para mantener viva tu figura.`;
  setNotice("Tu figura ya esta en el escenario.");
}

function receive(event) {
  const message = JSON.parse(event.data);

  if (message.instruments) {
    instruments = message.instruments;
    renderInstruments();
  }

  if (message.state) {
    stageState.textContent = message.state.stageConnected ? "Stage conectado" : "Stage sin conectar";
  }

  if (message.type === "user.assigned") {
    renderAssignedUser(message.user);
  }
}

function connect() {
  clearTimeout(reconnectTimer);
  setSocketStatus("Conectando", "");
  socket = new WebSocket(socketUrl());

  socket.addEventListener("open", () => {
    setSocketStatus("En linea", "online");
    setNotice("Elige un instrumento para crear tu figura.");
  });

  socket.addEventListener("message", receive);
  socket.addEventListener("close", () => {
    setSocketStatus("Reconectando", "offline");
    setNotice("Se perdio la conexion. Reintentando.");
    reconnectTimer = setTimeout(connect, 1200);
  });
}

// Convert acceleration into a stable 0-1 energy signal for the shared stage.
function motionToEnergy(event) {
  const acceleration = event.accelerationIncludingGravity ?? event.acceleration ?? {};
  const x = acceleration.x ?? 0;
  const y = acceleration.y ?? 0;
  const z = acceleration.z ?? 0;
  const magnitude = Math.sqrt(x * x + y * y + z * z);
  const shake = Math.min(1, Math.max(0, (magnitude - 9.8) / 11));

  return {
    energy: Math.min(1, Math.max(0.06, shake * 1.35)),
    shake,
    tiltX: Math.max(-1, Math.min(1, x / 9.8)),
    tiltY: Math.max(-1, Math.min(1, y / 9.8))
  };
}

function sendMotion(motion) {
  if (!assignedUser) {
    return;
  }

  const now = performance.now();
  if (now - lastMotionSentAt < 120) {
    return;
  }

  lastMotionSentAt = now;
  energyFill.style.width = `${Math.round(motion.energy * 100)}%`;
  orbPreview.style.transform = `scale(${0.92 + motion.energy * 0.28})`;
  send({ type: "user.motion", ...motion });
}

async function enableMotion() {
  // iOS requires the permission request to happen inside a user gesture.
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    const permission = await DeviceMotionEvent.requestPermission();
    if (permission !== "granted") {
      motionHint.textContent = "No se concedio permiso de movimiento. Usa el boton para simular energia.";
      return;
    }
  }

  window.addEventListener("devicemotion", (event) => sendMotion(motionToEnergy(event)));
  motionButton.textContent = "Mantener energia";
  motionHint.textContent = "Agita suavemente o manten presionado para pruebas.";
}

motionButton.addEventListener("click", enableMotion);

// Manual fallback for laptops and for quick tests when sensor data is sparse.
motionButton.addEventListener("pointerdown", () => {
  fallbackPulse = 1;
  sendMotion({ energy: 1, shake: 1, tiltX: 0, tiltY: 0 });
});

motionButton.addEventListener("pointerup", () => {
  fallbackPulse = 0;
  sendMotion({ energy: 0.12, shake: 0, tiltX: 0, tiltY: 0 });
});

setInterval(() => {
  if (fallbackPulse > 0) {
    sendMotion({ energy: 0.8, shake: 0.8, tiltX: 0, tiltY: 0 });
  }
}, 180);

connect();
