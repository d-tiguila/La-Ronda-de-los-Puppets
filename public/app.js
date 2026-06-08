import { createPuppetSvg, paletteColor } from "./puppet-art.js";

const characterEl = document.querySelector("#phoneCharacter");
const radialMenu = document.querySelector("#radialMenu");
const notice = document.querySelector("#notice");

const characterSeed = Math.floor(Math.random() * 100000);

let socket;
let instruments = [];
let selectedInstrument = null;
let assignedUser = null;
let reconnectTimer = null;
let lastMotionSentAt = 0;
let latestOrientationAt = 0;
let smoothedTilt = { x: 0, y: 0 };
let motionEnabled = false;

function socketUrl() {
  const url = new URL("/ws?role=controller", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

function setNotice(message = "") {
  notice.textContent = message;
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function polarPoint(index, total, radius) {
  const startAngle = total <= 5 ? -90 : -120;
  const angle = (startAngle + (360 / total) * index) * (Math.PI / 180);

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius
  };
}

function renderCharacter() {
  characterEl.innerHTML = createPuppetSvg(characterSeed, "phone-puppet-svg");
  characterEl.style.setProperty("--menu-color", paletteColor(characterSeed));
  gsap.fromTo(characterEl, { scale: 0.78, rotate: -4, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.62, ease: "back.out(1.7)" });
}

function renderRadialMenu(items, onSelect) {
  const oldItems = [...radialMenu.children];
  const radius = Math.min(window.innerWidth, window.innerHeight) * 0.31;

  if (oldItems.length) {
    gsap.to(oldItems, {
      scale: 0.72,
      opacity: 0,
      duration: 0.18,
      stagger: 0.018,
      ease: "power2.in",
      onComplete: () => buildMenu(items, onSelect, radius)
    });
    return;
  }

  buildMenu(items, onSelect, radius);
}

function buildMenu(items, onSelect, radius) {
  radialMenu.replaceChildren();

  items.forEach((item, index) => {
    const point = polarPoint(index, items.length, radius);
    const button = document.createElement("button");
    button.className = "radial-item";
    button.type = "button";
    button.style.setProperty("--item-color", item.color);
    button.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
    button.innerHTML = `<span>${item.label}</span>`;
    button.addEventListener("click", () => onSelect(item));
    radialMenu.append(button);
  });

  gsap.fromTo(
    radialMenu.children,
    { scale: 0.62, opacity: 0, rotate: -8 },
    { scale: 1, opacity: 1, rotate: 0, duration: 0.42, stagger: 0.035, ease: "back.out(1.45)" }
  );
}

function renderInstrumentMenu() {
  renderRadialMenu(
    instruments.map((instrument) => ({
      ...instrument,
      color: instrument.color
    })),
    (instrument) => {
      selectedInstrument = instrument;
      gsap.to(characterEl, { scale: 1.07, rotate: 4, yoyo: true, repeat: 1, duration: 0.16, ease: "power2.out" });
      renderChordMenu(instrument);
    }
  );
}

function renderChordMenu(instrument) {
  renderRadialMenu(
    instrument.chords.map((chord, index) => ({
      ...chord,
      color: paletteColor(index + characterSeed)
    })),
    (chord) => {
      enableMotion();
      send({ type: "user.join", instrumentId: instrument.id, chordId: chord.id, visualSeed: characterSeed });
      setNotice("");
      gsap.to(characterEl, { scale: 1.16, yoyo: true, repeat: 1, duration: 0.18, ease: "power2.out" });
    }
  );
}

function tiltToMotion(rawTiltX, rawTiltY) {
  smoothedTilt = {
    x: smoothedTilt.x * 0.58 + clamp(rawTiltX, -1, 1) * 0.42,
    y: smoothedTilt.y * 0.58 + clamp(rawTiltY, -1, 1) * 0.42
  };

  const tiltAmount = clamp(Math.hypot(smoothedTilt.x, smoothedTilt.y), 0, 1);

  return {
    energy: 0.62 + tiltAmount * 0.34,
    shake: tiltAmount,
    tiltX: smoothedTilt.x,
    tiltY: smoothedTilt.y
  };
}

function sendMotion(motion) {
  if (!assignedUser) {
    return;
  }

  const now = performance.now();
  if (now - lastMotionSentAt < 70) {
    return;
  }

  lastMotionSentAt = now;
  characterEl.style.transform = `translate(${motion.tiltX * 26}px, ${motion.tiltY * 34}px) rotate(${motion.tiltX * 10}deg)`;
  send({ type: "user.motion", ...motion });
}

function orientationToMotion(event) {
  latestOrientationAt = performance.now();
  return tiltToMotion((event.gamma ?? 0) / 20, (event.beta ?? 0) / 16);
}

function accelerationToMotion(event) {
  const acceleration = event.accelerationIncludingGravity ?? event.acceleration ?? {};
  return tiltToMotion((acceleration.x ?? 0) / 5.6, (acceleration.y ?? 0) / 4.6);
}

async function enableMotion() {
  if (motionEnabled) {
    return;
  }

  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    const permission = await DeviceOrientationEvent.requestPermission();
    if (permission !== "granted") {
      setNotice("Activa orientacion para mover tu puppet.");
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
  motionEnabled = true;
}

function receive(event) {
  const message = JSON.parse(event.data);

  if (message.instruments) {
    instruments = message.instruments;
    renderInstrumentMenu();
  }

  if (message.type === "user.assigned") {
    assignedUser = message.user;
    renderRadialMenu([{ label: message.user.chordLabel, color: message.user.color }], () => {
      assignedUser = null;
      selectedInstrument ? renderChordMenu(selectedInstrument) : renderInstrumentMenu();
    });
  }

  if (message.state && assignedUser && !message.state.users.some((user) => user.id === assignedUser.id)) {
    assignedUser = null;
    selectedInstrument ? renderChordMenu(selectedInstrument) : renderInstrumentMenu();
  }
}

function connect() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(socketUrl());

  socket.addEventListener("open", () => setNotice(""));
  socket.addEventListener("message", receive);
  socket.addEventListener("close", () => {
    setNotice("Reconectando");
    reconnectTimer = setTimeout(connect, 1200);
  });
}

window.addEventListener("resize", () => {
  if (assignedUser) {
    return;
  }

  selectedInstrument ? renderChordMenu(selectedInstrument) : renderInstrumentMenu();
});

renderCharacter();
connect();
