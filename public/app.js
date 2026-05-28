const instrumentGrid = document.querySelector("#instrumentGrid");
const chordPanel = document.querySelector("#chordPanel");
const chordGrid = document.querySelector("#chordGrid");
const backToInstruments = document.querySelector("#backToInstruments");
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
let selectedInstrument = null;
let reconnectTimer = null;
let fallbackPulse = 0;
let lastMotionSentAt = 0;
let lastMotionVector = null;
let smoothedEnergy = 0;

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
      selectedInstrument = instrument;
      renderChords(instrument);
    });
    instrumentGrid.append(button);
  });
}

// A participant first picks an instrument, then chooses the chord their figure will hold.
function renderChords(instrument) {
  chordGrid.replaceChildren();
  chordPanel.hidden = false;
  motionPanel.hidden = true;

  instrument.chords.forEach((chord) => {
    const button = document.createElement("button");
    button.className = "chord-card";
    button.type = "button";
    button.style.setProperty("--instrument-color", instrument.color);
    button.innerHTML = `
      <strong>${chord.label}</strong>
      <span>${chord.notes.join(" . ")}</span>
    `;
    button.addEventListener("click", () => {
      send({ type: "user.join", instrumentId: instrument.id, chordId: chord.id });
    });
    chordGrid.append(button);
  });
}

// Reflect the assigned sound bubble on the phone so the participant knows they are live.
function renderAssignedUser(user) {
  assignedUser = user;
  lastMotionVector = null;
  smoothedEnergy = 0;
  motionPanel.hidden = false;
  orbPreview.style.setProperty("--instrument-color", user.color);
  assignedTitle.textContent = `${user.instrumentLabel} - ${user.chordLabel}`;
  assignedNote.textContent = `Acorde MIDI ${user.midiNotes.join(" . ")}. Agita para mantener viva tu figura.`;
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

// Convert lightstick-like movement into a gentle 0-1 energy signal for the shared stage.
function motionToEnergy(event) {
  const acceleration = event.accelerationIncludingGravity ?? event.acceleration ?? {};
  const x = acceleration.x ?? 0;
  const y = acceleration.y ?? 0;
  const z = acceleration.z ?? 0;
  const currentVector = { x, y, z };
  const previousVector = lastMotionVector ?? currentVector;
  const deltaX = x - previousVector.x;
  const deltaY = y - previousVector.y;
  const deltaZ = z - previousVector.z;
  const deltaMagnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
  const lightstickGesture = Math.min(1, deltaMagnitude / 2.35);
  const targetEnergy = lightstickGesture > 0.012 ? 0.18 + lightstickGesture * 0.82 : 0;
  const smoothing = targetEnergy > smoothedEnergy ? 0.34 : 0.24;

  lastMotionVector = currentVector;
  smoothedEnergy = smoothedEnergy * (1 - smoothing) + targetEnergy * smoothing;

  return {
    energy: Math.min(1, smoothedEnergy),
    shake: lightstickGesture,
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
  motionHint.textContent = "Mueve el celular como un lightstick: suave, continuo y sin fuerza.";
}

motionButton.addEventListener("click", enableMotion);

backToInstruments.addEventListener("click", () => {
  selectedInstrument = null;
  assignedUser = null;
  chordPanel.hidden = true;
  motionPanel.hidden = true;
  setNotice("Elige otro instrumento.");
});

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
