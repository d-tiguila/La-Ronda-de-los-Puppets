const { Engine, World, Bodies, Body } = Matter;

const worldEl = document.querySelector("#stageWorld");
const playheadEl = document.querySelector("#playhead");
const emptyState = document.querySelector("#emptyState");
const stageSocket = document.querySelector("#stageSocket");
const userCount = document.querySelector("#userCount");
const tdState = document.querySelector("#tdState");
const pauseButton = document.querySelector("#pauseButton");

const engine = Engine.create();
engine.gravity.y = 0;

const bubbles = new Map();
const DEMO_BUBBLE_COUNT = 12;
const DEMO_INSTRUMENTS = ["pulse", "bass", "spark", "texture", "harmony"];
const DEMO_CHORDS = ["c", "dm", "em", "f", "g"];
const DEMO_CHORD_LABELS = ["C", "Dm", "Em", "F", "G"];
let socket;
let sequencerRadius = 0;
let playheadCycle = 0;
let lastTime = performance.now();
let paused = false;

function socketUrl() {
  const url = new URL("/ws?role=stage", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function worldSize() {
  return {
    width: worldEl.clientWidth,
    height: worldEl.clientHeight
  };
}

function gardenCenter() {
  const { width, height } = worldSize();
  return {
    x: width / 2,
    y: height / 2
  };
}

function randomGardenPosition() {
  const { width, height } = worldSize();
  const center = gardenCenter();
  const maxRadius = Math.max(80, Math.min(width, height) * 0.42);
  const radius = 70 + Math.random() * Math.max(40, maxRadius - 70);
  const angle = Math.random() * Math.PI * 2;

  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius
  };
}

// Keep invisible Matter.js walls aligned with the browser viewport.
function rebuildBounds() {
  const { width, height } = worldSize();
  World.clear(engine.world, false);

  World.add(engine.world, [
    Bodies.rectangle(width / 2, -30, width, 60, { isStatic: true }),
    Bodies.rectangle(width / 2, height + 30, width, 60, { isStatic: true }),
    Bodies.rectangle(-30, height / 2, 60, height, { isStatic: true }),
    Bodies.rectangle(width + 30, height / 2, 60, height, { isStatic: true })
  ]);

  for (const bubble of bubbles.values()) {
    World.add(engine.world, bubble.body);
  }
}

function createBubble(user) {
  const radius = 38 + user.energy * 28;
  const { x, y } = randomGardenPosition();
  const body = Bodies.circle(x, y, radius, {
    restitution: 0.96,
    frictionAir: 0.035
  });
  const el = document.createElement("div");
  el.className = "bubble flower";
  el.style.setProperty("--bubble-color", user.color);
  el.innerHTML = `
    <span class="petal petal-a"></span>
    <span class="petal petal-b"></span>
    <span class="petal petal-c"></span>
    <span class="petal petal-d"></span>
    <span class="flower-core"></span>
    <span class="flower-label">
      <strong>${user.instrumentLabel}</strong>
      <em>${user.chordLabel}</em>
    </span>
  `;
  worldEl.append(el);
  World.add(engine.world, body);

  const bubble = {
    id: user.id,
    demo: Boolean(user.demo),
    instrumentId: user.instrumentId,
    chordId: user.chordId,
    body,
    el,
    renderScale: 0,
    visualOpacity: 1,
    radius,
    physicsRadius: radius,
    targetEnergy: user.energy,
    targetShake: user.shake ?? 0,
    targetTiltX: 0,
    targetTiltY: 0,
    shakeBurst: 0,
    windSeed: Math.random() * 1000,
    lastTriggeredCycle: -1
  };

  bubbles.set(user.id, bubble);
  gsap.to(bubble, {
    renderScale: 1,
    duration: 0.45,
    ease: "back.out(1.8)"
  });
  gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.32, ease: "power2.out" });
  return bubble;
}

function removeBubble(userId) {
  const bubble = bubbles.get(userId);
  if (!bubble) {
    return;
  }

  bubbles.delete(userId);
  World.remove(engine.world, bubble.body);
  gsap.to(bubble, { renderScale: 0, duration: 0.72, ease: "power2.inOut" });
  gsap.to(bubble.el, {
    opacity: 0,
    duration: 0.72,
    filter: "blur(12px) grayscale(0.7)",
    ease: "power2.inOut",
    onComplete: () => bubble.el.remove()
  });
}

// Server state owns identity and energy; the stage owns physics and rendering.
function syncBubbles(users) {
  const liveIds = new Set(users.map((user) => user.id));

  for (const [userId, bubble] of bubbles) {
    if (!bubble.demo && !liveIds.has(userId)) {
      removeBubble(userId);
    }
  }

  users.forEach((user) => {
    const bubble = bubbles.get(user.id) ?? createBubble(user);
    bubble.demo = false;
    bubble.instrumentId = user.instrumentId;
    bubble.chordId = user.chordId;
    const targetRadius = user.alive ? 42 + user.energy * 30 : 30;
    const scale = targetRadius / bubble.physicsRadius;
    bubble.physicsRadius = targetRadius;
    gsap.to(bubble, { radius: targetRadius, duration: 0.85, ease: "power2.out", overwrite: "auto" });
    bubble.targetEnergy = user.energy;
    bubble.targetShake = user.shake;
    bubble.targetTiltX = user.tiltX;
    bubble.targetTiltY = user.tiltY;
    bubble.shakeBurst = Math.max(bubble.shakeBurst * 0.82, user.shake);
    bubble.el.style.setProperty("--bubble-color", user.color);
    bubble.el.querySelector("strong").textContent = user.instrumentLabel;
    bubble.el.querySelector("em").textContent = user.chordLabel;
    bubble.el.classList.toggle("is-shaking", user.shake > 0.08);
    Body.scale(bubble.body, scale, scale);
    gsap.to(bubble.el, {
      opacity: user.alive ? 1 : 0.42,
      filter: user.alive ? "grayscale(0) blur(0px)" : "grayscale(0.55) blur(1.5px)",
      duration: 1.15,
      ease: "sine.inOut",
      overwrite: "auto"
    });

    // Tilt gives each participant a soft steering influence, closer to a lightstick than a joystick.
    Body.applyForce(bubble.body, bubble.body.position, {
      x: user.tiltX * (0.00034 + user.energy * 0.00048),
      y: -user.tiltY * (0.00034 + user.energy * 0.00048)
    });
  });

  emptyState.hidden = users.length > 0 || DEMO_BUBBLE_COUNT > 0;
  userCount.textContent = `${users.length} flor${users.length === 1 ? "" : "es"}`;
}

function bloomFlower(userId) {
  const bubble = bubbles.get(userId);
  if (!bubble) {
    return;
  }

  bubble.el.classList.add("is-triggered", "is-blooming");
  gsap.fromTo(bubble, { renderScale: 1.24 }, {
    renderScale: 1,
    duration: 0.72,
    ease: "elastic.out(1, 0.48)",
    onComplete: () => bubble.el.classList.remove("is-triggered", "is-blooming")
  });
}

// Temporary demo bubbles let us test Matter.js density and MIDI sound without extra phones.
function createDemoBubbles() {
  const colors = ["#f56f5c", "#40b3a2", "#f2bf4b", "#7a8ff0", "#d97fe7"];

  for (let index = 0; index < DEMO_BUBBLE_COUNT; index += 1) {
    const instrumentId = DEMO_INSTRUMENTS[index % DEMO_INSTRUMENTS.length];
    const chordId = DEMO_CHORDS[index % DEMO_CHORDS.length];
    createBubble({
      id: `demo-${index}`,
      demo: true,
      instrumentId,
      chordId,
      instrumentLabel: "Demo",
      chordLabel: DEMO_CHORD_LABELS[index % DEMO_CHORD_LABELS.length],
      color: colors[index % colors.length],
      energy: 0.35 + Math.random() * 0.42,
      alive: true
    });
  }
}

function receive(event) {
  const message = JSON.parse(event.data);

  if (message.state) {
    syncBubbles(message.state.users);
    tdState.textContent = message.state.touchDesignerConnected
      ? "TouchDesigner conectado"
      : "TouchDesigner sin conectar";
  }

  if (message.type === "bubble.pulse") {
    bloomFlower(message.userId);
  }
}

function connect() {
  stageSocket.textContent = "Conectando";
  socket = new WebSocket(socketUrl());
  socket.addEventListener("open", () => {
    stageSocket.textContent = "En linea";
  });
  socket.addEventListener("message", receive);
  socket.addEventListener("close", () => {
    stageSocket.textContent = "Reconectando";
    setTimeout(connect, 1200);
  });
}

// A radial wave turns distance from the center into musical timing.
function updateSequencer(deltaMs) {
  const { width, height } = worldSize();
  const center = gardenCenter();
  const maxRadius = Math.hypot(width, height) / 2 + 90;
  sequencerRadius += deltaMs * 0.135;

  if (sequencerRadius > maxRadius) {
    sequencerRadius = 0;
    playheadCycle += 1;
  }

  playheadEl.style.width = `${sequencerRadius * 2}px`;
  playheadEl.style.height = `${sequencerRadius * 2}px`;
  playheadEl.style.transform = `translate(${center.x - sequencerRadius}px, ${center.y - sequencerRadius}px)`;
}

function triggerCrossedFlowers() {
  const center = gardenCenter();

  for (const bubble of bubbles.values()) {
    const distanceFromCenter = Math.hypot(
      bubble.body.position.x - center.x,
      bubble.body.position.y - center.y
    );
    const touchedByWave = Math.abs(distanceFromCenter - sequencerRadius) <= bubble.radius;

    if (touchedByWave && bubble.lastTriggeredCycle !== playheadCycle) {
      bubble.lastTriggeredCycle = playheadCycle;
      if (bubble.demo) {
        send({
          type: "stage.demoTrigger",
          demoId: bubble.id,
          instrumentId: bubble.instrumentId,
          chordId: bubble.chordId,
          energy: bubble.targetEnergy
        });
      } else {
        send({ type: "stage.trigger", userId: bubble.id });
      }
    }
  }
}

function applyAmbientForces(now) {
  for (const bubble of bubbles.values()) {
    const windA = Math.sin(now * 0.00055 + bubble.windSeed);
    const windB = Math.cos(now * 0.00042 + bubble.windSeed * 1.7);
    const demoLift = bubble.demo ? 0.00009 : 0.000035;
    const userDrift = bubble.demo ? 0 : bubble.targetEnergy * 0.00008;
    const shakePush = bubble.demo ? 0 : bubble.shakeBurst * 0.00115;
    const shakeA = Math.sin(now * 0.0018 + bubble.windSeed * 2.3);
    const shakeB = Math.cos(now * 0.0015 + bubble.windSeed * 3.1);

    Body.applyForce(bubble.body, bubble.body.position, {
      x: windA * (demoLift + userDrift) + shakeA * shakePush,
      y: windB * (demoLift * 0.75 + userDrift) + shakeB * shakePush
    });
    bubble.shakeBurst *= 0.94;
  }
}

function togglePause() {
  paused = !paused;
  pauseButton.textContent = paused ? "Reanudar" : "Pausa";
  pauseButton.setAttribute("aria-pressed", String(paused));
}

function render() {
  const now = performance.now();
  const deltaMs = now - lastTime;
  lastTime = now;

  if (!paused) {
    applyAmbientForces(now);
    Engine.update(engine, Math.min(deltaMs, 32));
    updateSequencer(deltaMs);
    triggerCrossedFlowers();
  }

  for (const bubble of bubbles.values()) {
    const { x, y } = bubble.body.position;
    bubble.el.style.width = `${bubble.radius * 2}px`;
    bubble.el.style.height = `${bubble.radius * 2}px`;
    bubble.el.style.transform = `translate(${x - bubble.radius}px, ${y - bubble.radius}px) scale(${bubble.renderScale})`;
  }

  requestAnimationFrame(render);
}

window.addEventListener("resize", rebuildBounds);
pauseButton.addEventListener("click", togglePause);
rebuildBounds();
createDemoBubbles();
connect();
render();
