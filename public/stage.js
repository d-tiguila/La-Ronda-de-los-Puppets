const { Engine, World, Bodies, Body } = Matter;

const worldEl = document.querySelector("#stageWorld");
const playheadEl = document.querySelector("#playhead");
const emptyState = document.querySelector("#emptyState");
const stageSocket = document.querySelector("#stageSocket");
const userCount = document.querySelector("#userCount");
const tdState = document.querySelector("#tdState");

const engine = Engine.create();
engine.gravity.y = 0;

const bubbles = new Map();
const DEMO_BUBBLE_COUNT = 12;
let socket;
let playheadX = 0;
let playheadCycle = 0;
let lastTime = performance.now();

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
  const { width, height } = worldSize();
  const radius = 38 + user.energy * 28;
  const x = 90 + Math.random() * Math.max(80, width - 180);
  const y = 90 + Math.random() * Math.max(80, height - 180);
  const body = Bodies.circle(x, y, radius, {
    restitution: 0.96,
    frictionAir: 0.018
  });
  const el = document.createElement("div");
  el.className = "bubble";
  el.style.setProperty("--bubble-color", user.color);
  el.innerHTML = `
    <strong>${user.instrumentLabel}</strong>
    <span>${user.chordLabel}</span>
  `;
  worldEl.append(el);
  World.add(engine.world, body);

  const bubble = {
    id: user.id,
    demo: Boolean(user.demo),
    body,
    el,
    renderScale: 0,
    radius,
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
  gsap.to(bubble, {
    renderScale: 0,
    duration: 0.36,
    ease: "power2.in"
  });
  gsap.to(bubble.el, {
    opacity: 0,
    duration: 0.36,
    ease: "power2.in",
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
    const targetRadius = user.alive ? 38 + user.energy * 32 : 22;
    const scale = targetRadius / bubble.radius;
    bubble.radius = targetRadius;
    bubble.el.style.setProperty("--bubble-color", user.color);
    bubble.el.classList.toggle("is-dormant", !user.alive);
    bubble.el.querySelector("strong").textContent = user.instrumentLabel;
    bubble.el.querySelector("span").textContent = user.chordLabel;
    Body.scale(bubble.body, scale, scale);

    // Tilt gives each participant a subtle steering influence over their shape.
    Body.applyForce(bubble.body, bubble.body.position, {
      x: user.tiltX * (0.0008 + user.energy * 0.0012),
      y: -user.tiltY * (0.0008 + user.energy * 0.0012)
    });
  });

  emptyState.hidden = users.length > 0 || DEMO_BUBBLE_COUNT > 0;
  userCount.textContent = `${users.length} figura${users.length === 1 ? "" : "s"}`;
}

function pulseBubble(userId) {
  const bubble = bubbles.get(userId);
  if (!bubble) {
    return;
  }

  bubble.el.classList.add("is-triggered");
  gsap.fromTo(bubble, { renderScale: 1.16 }, {
    renderScale: 1,
    duration: 0.32,
    ease: "elastic.out(1, 0.45)",
    onComplete: () => bubble.el.classList.remove("is-triggered")
  });
}

// Temporary visual-only bubbles let us test Matter.js density without extra phones.
function createDemoBubbles() {
  const colors = ["#f56f5c", "#40b3a2", "#f2bf4b", "#7a8ff0", "#d97fe7"];
  const labels = ["C", "Dm", "Em", "F", "G"];

  for (let index = 0; index < DEMO_BUBBLE_COUNT; index += 1) {
    createBubble({
      id: `demo-${index}`,
      demo: true,
      instrumentLabel: "Demo",
      chordLabel: labels[index % labels.length],
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
    pulseBubble(message.userId);
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

// A moving playhead turns spatial positions into musical timing.
function updatePlayhead(deltaMs) {
  const { width } = worldSize();
  playheadX += deltaMs * 0.14;

  if (playheadX > width + 40) {
    playheadX = -40;
    playheadCycle += 1;
  }

  playheadEl.style.transform = `translateX(${playheadX}px)`;
}

function triggerCrossedBubbles() {
  for (const bubble of bubbles.values()) {
    const distance = Math.abs(bubble.body.position.x - playheadX);
    if (distance <= bubble.radius && bubble.lastTriggeredCycle !== playheadCycle) {
      bubble.lastTriggeredCycle = playheadCycle;
      if (bubble.demo) {
        pulseBubble(bubble.id);
      } else {
        send({ type: "stage.trigger", userId: bubble.id });
      }
    }
  }
}

function render() {
  const now = performance.now();
  const deltaMs = now - lastTime;
  lastTime = now;

  Engine.update(engine, Math.min(deltaMs, 32));
  updatePlayhead(deltaMs);
  triggerCrossedBubbles();

  for (const bubble of bubbles.values()) {
    const { x, y } = bubble.body.position;
    bubble.el.style.width = `${bubble.radius * 2}px`;
    bubble.el.style.height = `${bubble.radius * 2}px`;
    bubble.el.style.transform = `translate(${x - bubble.radius}px, ${y - bubble.radius}px) scale(${bubble.renderScale})`;
  }

  requestAnimationFrame(render);
}

window.addEventListener("resize", rebuildBounds);
rebuildBounds();
createDemoBubbles();
connect();
render();
