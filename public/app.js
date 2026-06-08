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
let latestOrientationAt = 0;
let fallbackTiltPhase = 0;
let smoothedTilt = { x: 0, y: 0 };

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
  smoothedTilt = { x: 0, y: 0 };
  motionPanel.hidden = false;
  orbPreview.style.setProperty("--instrument-color", user.color);
  assignedTitle.textContent = `${user.instrumentLabel} - ${user.chordLabel}`;
  assignedNote.textContent = `Acorde MIDI ${user.midiNotes.join(" . ")}. Inclina el telefono para mover tu figura.`;
  setNotice("Tu figura ya esta en el escenario.");
}

function releaseAssignedUser() {
  assignedUser = null;
  smoothedTilt = { x: 0, y: 0 };
  lastMotionVector = null;
  energyFill.style.width = "0%";
  orbPreview.style.transform = "scale(0.92)";
  motionPanel.hidden = true;

  if (selectedInstrument) {
    renderChords(selectedInstrument);
    setNotice("Tu flor se marchito. Elige un acorde para sembrar otra.");
    return;
  }

  chordPanel.hidden = true;
  setNotice("Tu flor se marchito. Elige un instrumento para sembrar otra.");
}

function receive(event) {
  const message = JSON.parse(event.data);

  if (message.instruments) {
    instruments = message.instruments;
    renderInstruments();
  }

  if (message.state) {
    stageState.textContent = message.state.stageConnected ? "Stage conectado" : "Stage sin conectar";

    if (assignedUser && !message.state.users.some((user) => user.id === assignedUser.id)) {
      releaseAssignedUser();
    }
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function tiltToMotion(rawTiltX, rawTiltY) {
  smoothedTilt = {
    x: smoothedTilt.x * 0.68 + clamp(rawTiltX, -1, 1) * 0.32,
    y: smoothedTilt.y * 0.68 + clamp(rawTiltY, -1, 1) * 0.32
  };

  const tiltAmount = clamp(Math.hypot(smoothedTilt.x, smoothedTilt.y), 0, 1);

  return {
    energy: 0.58 + tiltAmount * 0.34,
    shake: tiltAmount,
    tiltX: smoothedTilt.x,
    tiltY: smoothedTilt.y
  };
}

// Device orientation gives the participant direct puppet steering with the phone rotation.
function orientationToMotion(event) {
  latestOrientationAt = performance.now();
  const gamma = event.gamma ?? 0;
  const beta = event.beta ?? 0;

  return tiltToMotion(gamma / 38, beta / 38);
}

// Some browsers expose only motion acceleration; use gravity as a fallback tilt source.
function accelerationToMotion(event) {
  const acceleration = event.accelerationIncludingGravity ?? event.acceleration ?? {};
  const x = acceleration.x ?? 0;
  const y = acceleration.y ?? 0;
  const z = acceleration.z ?? 0;
  const currentVector = { x, y, z };

  lastMotionVector = currentVector;
  return tiltToMotion(x / 8.8, y / 8.8);
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
  energyFill.style.width = `${Math.round(Math.hypot(motion.tiltX, motion.tiltY) * 100)}%`;
  orbPreview.style.transform = `translate(${motion.tiltX * 14}px, ${motion.tiltY * 14}px) scale(${0.98 + motion.shake * 0.14})`;
  send({ type: "user.motion", ...motion });
}

async function enableMotion() {
  // iOS requires sensor permission requests to happen inside a user gesture.
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    const permission = await DeviceOrientationEvent.requestPermission();
    if (permission !== "granted") {
      motionHint.textContent = "No se concedio permiso de orientacion. Mantén presionado el boton para probar.";
      return;
    }
  }

  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    await DeviceMotionEvent.requestPermission().catch(() => null);
  }

  window.addEventListener("deviceorientation", (event) => sendMotion(orientationToMotion(event)));
  window.addEventListener("devicemotion", (event) => {
    if (performance.now() - latestOrientationAt > 500) {
      sendMotion(accelerationToMotion(event));
    }
  });
  motionButton.textContent = "Control activo";
  motionHint.textContent = "Inclina el celular suavemente para empujar tu personaje.";
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
});

motionButton.addEventListener("pointerup", () => {
  fallbackPulse = 0;
  sendMotion(tiltToMotion(0, 0));
});

setInterval(() => {
  if (fallbackPulse > 0) {
    fallbackTiltPhase += 0.42;
    sendMotion(tiltToMotion(Math.cos(fallbackTiltPhase) * 0.85, Math.sin(fallbackTiltPhase) * 0.85));
  }
}, 180);

connect();
