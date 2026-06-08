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

const puppets = new Map();
const DEMO_PUPPET_COUNT = 10;
const DEMO_INSTRUMENTS = ["pulse", "bass", "spark", "texture", "harmony"];
const DEMO_CHORDS = ["c", "dm", "em", "f", "g"];
const DEMO_CHORD_LABELS = ["C", "Dm", "Em", "F", "G"];
const BODY_PALETTES = [
  ["#09c2b2", "#6a46d9", "#f6d23a"],
  ["#ff5bb4", "#f3a1d8", "#f5c54b"],
  ["#ff725e", "#12c7bc", "#ffe85c"],
  ["#7a8ff0", "#ff7ac8", "#35d7a9"],
  ["#ffd21f", "#ff7f11", "#02b8f3"],
  ["#9be4a6", "#21b89c", "#f65ba4"]
];

let socket;
let sequencerRadius = 0;
let playheadCycle = 0;
let lastTime = performance.now();
let paused = false;
let paperCanvas;

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

function randomFrom(list, seed) {
  return list[Math.abs(seed) % list.length];
}

function seededNumber(id) {
  return [...String(id)].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function worldSize() {
  const bounds = worldEl.getBoundingClientRect();
  const fallbackSize = Math.max(360, Math.min(window.innerWidth || 960, window.innerHeight || 960));

  return {
    width: worldEl.clientWidth || bounds.width || fallbackSize,
    height: worldEl.clientHeight || bounds.height || fallbackSize
  };
}

function stageCenter() {
  const { width, height } = worldSize();
  return {
    x: width / 2,
    y: height / 2
  };
}

function randomStagePosition() {
  const { width, height } = worldSize();
  const center = stageCenter();
  const maxRadius = Math.max(90, Math.min(width, height) * 0.42);
  const radius = 72 + Math.random() * Math.max(40, maxRadius - 72);
  const angle = Math.random() * Math.PI * 2;

  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius
  };
}

function demoStagePosition(index) {
  const { width, height } = worldSize();
  const columns = 5;
  const rows = Math.ceil(DEMO_PUPPET_COUNT / columns);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const cellWidth = width / (columns + 1);
  const cellHeight = height / (rows + 1);
  const wobbleX = Math.sin(index * 1.7) * cellWidth * 0.18;
  const wobbleY = Math.cos(index * 1.3) * cellHeight * 0.14;

  return {
    x: cellWidth * (column + 1) + wobbleX,
    y: cellHeight * (row + 1) + wobbleY
  };
}

function setupPaperCanvas() {
  paperCanvas = document.createElement("canvas");
  paperCanvas.className = "puppet-canvas";
  worldEl.append(paperCanvas);
  paper.setup(paperCanvas);
  resizePaperCanvas();
}

function resizePaperCanvas() {
  if (!paperCanvas) {
    return;
  }

  const { width, height } = worldSize();
  paperCanvas.width = width * window.devicePixelRatio;
  paperCanvas.height = height * window.devicePixelRatio;
  paperCanvas.style.width = `${width}px`;
  paperCanvas.style.height = `${height}px`;
  paper.view.viewSize = new paper.Size(width, height);
}

// Keep invisible Matter.js walls aligned with the canvas bounds.
function rebuildBounds() {
  const { width, height } = worldSize();
  World.clear(engine.world, false);

  World.add(engine.world, [
    Bodies.rectangle(width / 2, -40, width, 80, { isStatic: true }),
    Bodies.rectangle(width / 2, height + 40, width, 80, { isStatic: true }),
    Bodies.rectangle(-40, height / 2, 80, height, { isStatic: true }),
    Bodies.rectangle(width + 40, height / 2, 80, height, { isStatic: true })
  ]);

  for (const puppet of puppets.values()) {
    World.add(engine.world, puppet.body);
  }
}

function blobPath(points, radius, irregularity) {
  const path = new paper.Path({ closed: true });

  for (let index = 0; index < points; index += 1) {
    const angle = (Math.PI * 2 * index) / points;
    const wobble = 1 + Math.sin(index * 1.7) * irregularity;
    path.add(new paper.Point(Math.cos(angle) * radius * wobble, Math.sin(angle) * radius * wobble));
  }

  path.smooth({ type: "continuous" });
  return path;
}

function starPath(points, innerRadius, outerRadius) {
  const path = new paper.Path({ closed: true });

  for (let index = 0; index < points * 2; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * index) / points;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    path.add(new paper.Point(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }

  path.smooth({ type: "geometric" });
  return path;
}

function buildBodyShape(kind, size) {
  if (kind === "star") {
    return starPath(7, size * 0.54, size);
  }

  if (kind === "pill") {
    return new paper.Path.RoundRectangle({
      rectangle: new paper.Rectangle(-size * 0.72, -size, size * 1.44, size * 2),
      radius: size * 0.58
    });
  }

  if (kind === "triangle") {
    const path = new paper.Path({
      closed: true,
      segments: [
        new paper.Point(0, -size),
        new paper.Point(size * 0.95, size * 0.78),
        new paper.Point(-size * 0.95, size * 0.78)
      ]
    });
    path.smooth({ type: "geometric" });
    return path;
  }

  if (kind === "bean") {
    return blobPath(10, size, 0.34);
  }

  return blobPath(12, size, 0.14);
}

function addFace(group, style, size) {
  const eyeY = -size * 0.22;
  const eyeOffset = size * 0.28;
  const eyeColor = style.darkEyes ? "#071013" : "#f7f2e8";
  const pupilColor = style.darkEyes ? "#f7f2e8" : "#071013";

  const leftEye = new paper.Path.Ellipse({
    center: [-eyeOffset, eyeY],
    radius: [size * 0.16, size * 0.25],
    fillColor: eyeColor
  });
  const rightEye = leftEye.clone();
  rightEye.position.x = eyeOffset;

  const leftPupil = new paper.Path.Ellipse({
    center: [-eyeOffset + size * 0.03, eyeY + size * 0.03],
    radius: [size * 0.055, size * 0.11],
    fillColor: pupilColor
  });
  const rightPupil = leftPupil.clone();
  rightPupil.position.x = eyeOffset + size * 0.03;

  const browLeft = new paper.Path.Line({
    from: [-eyeOffset - size * 0.14, eyeY - size * 0.28],
    to: [-eyeOffset + size * 0.12, eyeY - size * 0.33],
    strokeColor: "#071013",
    strokeWidth: 4,
    strokeCap: "round"
  });
  const browRight = new paper.Path.Line({
    from: [eyeOffset - size * 0.12, eyeY - size * 0.33],
    to: [eyeOffset + size * 0.14, eyeY - size * 0.28],
    strokeColor: "#071013",
    strokeWidth: 4,
    strokeCap: "round"
  });

  const mouth = new paper.Path.Ellipse({
    center: [0, size * 0.28],
    radius: [size * 0.18, size * 0.05],
    fillColor: "#071013"
  });

  group.addChildren([leftEye, rightEye, leftPupil, rightPupil, browLeft, browRight, mouth]);
  return { mouth };
}

function addLimbs(group, style, size) {
  const limbColor = style.limb;
  const armWidth = 5;
  const legWidth = 5;

  const leftArm = new paper.Path({
    strokeColor: limbColor,
    strokeWidth: armWidth,
    strokeCap: "round"
  });
  leftArm.add(new paper.Point(-size * 0.68, size * 0.1));
  leftArm.add(new paper.Point(-size * 1.08, size * 0.45));
  leftArm.add(new paper.Point(-size * 1.2, size * 0.18));

  const rightArm = new paper.Path({
    strokeColor: limbColor,
    strokeWidth: armWidth,
    strokeCap: "round"
  });
  rightArm.add(new paper.Point(size * 0.68, size * 0.1));
  rightArm.add(new paper.Point(size * 1.08, size * 0.45));
  rightArm.add(new paper.Point(size * 1.2, size * 0.18));

  const leftLeg = new paper.Path({
    strokeColor: limbColor,
    strokeWidth: legWidth,
    strokeCap: "round"
  });
  leftLeg.add(new paper.Point(-size * 0.26, size * 0.72));
  leftLeg.add(new paper.Point(-size * 0.3, size * 1.08));

  const rightLeg = new paper.Path({
    strokeColor: limbColor,
    strokeWidth: legWidth,
    strokeCap: "round"
  });
  rightLeg.add(new paper.Point(size * 0.26, size * 0.72));
  rightLeg.add(new paper.Point(size * 0.3, size * 1.08));

  group.addChildren([leftArm, rightArm, leftLeg, rightLeg]);
}

function addTexture(group, style, size, seed) {
  const textureGroup = new paper.Group();
  const lineCount = 4 + (Math.abs(seed) % 4);

  for (let index = 0; index < lineCount; index += 1) {
    const y = -size * 0.48 + index * size * 0.22;
    const line = new paper.Path({
      strokeColor: style.accent,
      strokeWidth: 4,
      strokeCap: "round",
      opacity: 0.78
    });
    line.add(new paper.Point(-size * 0.58, y));
    line.add(new paper.Point(size * 0.5, y + Math.sin(index + seed) * size * 0.14));
    line.smooth();
    textureGroup.addChild(line);
  }

  group.addChild(textureGroup);
}

function createPuppetArt(user, size) {
  const seed = seededNumber(user.id);
  const palette = randomFrom(BODY_PALETTES, seed);
  const kind = randomFrom(["blob", "bean", "pill", "triangle", "star"], seed + 3);
  const style = {
    main: palette[0],
    secondary: palette[1],
    accent: palette[2],
    limb: seed % 2 === 0 ? "#071013" : "#f7f2e8",
    darkEyes: seed % 3 !== 0
  };

  const group = new paper.Group();
  const body = buildBodyShape(kind, size);
  body.fillColor = new paper.Color({
    gradient: {
      stops: [style.main, style.secondary]
    },
    origin: new paper.Point(-size * 0.65, -size * 0.72),
    destination: new paper.Point(size * 0.7, size * 0.8)
  });
  body.strokeColor = "#071013";
  body.strokeWidth = kind === "star" ? 3 : 0;

  addLimbs(group, style, size);
  group.addChild(body);
  addTexture(group, style, size, seed);
  const face = addFace(group, style, size);

  group.applyMatrix = false;
  return { group, body, mouth: face.mouth, style, kind };
}

function createPuppet(user) {
  const radius = 44 + user.energy * 26;
  const { x, y } = user.demoIndex === undefined ? randomStagePosition() : demoStagePosition(user.demoIndex);
  const body = Bodies.circle(x, y, radius, {
    restitution: 0.94,
    frictionAir: 0.038
  });
  const art = createPuppetArt(user, radius * 0.78);

  World.add(engine.world, body);

  const puppet = {
    id: user.id,
    demo: Boolean(user.demo),
    instrumentId: user.instrumentId,
    chordId: user.chordId,
    body,
    group: art.group,
    mouth: art.mouth,
    radius,
    physicsRadius: radius,
    targetEnergy: user.energy,
    targetShake: user.shake ?? 0,
    shakeBurst: 0,
    windSeed: Math.random() * 1000,
    anim: {
      scaleX: 0,
      scaleY: 0,
      mouthOpen: 0,
      wiggle: 0
    },
    lastTriggeredCycle: -1
  };

  puppets.set(user.id, puppet);
  gsap.to(puppet.anim, { scaleX: 1, scaleY: 1, duration: 0.58, ease: "back.out(1.8)" });
  return puppet;
}

function removePuppet(userId) {
  const puppet = puppets.get(userId);
  if (!puppet) {
    return;
  }

  puppets.delete(userId);
  World.remove(engine.world, puppet.body);
  gsap.to(puppet.anim, {
    scaleX: 0,
    scaleY: 0,
    mouthOpen: 0,
    duration: 0.72,
    ease: "power2.inOut",
    onComplete: () => puppet.group.remove()
  });
}

// Server state owns identity and energy; the stage owns physics and drawing.
function syncPuppets(users) {
  const liveIds = new Set(users.map((user) => user.id));

  for (const [userId, puppet] of puppets) {
    if (!puppet.demo && !liveIds.has(userId)) {
      removePuppet(userId);
    }
  }

  users.forEach((user) => {
    const puppet = puppets.get(user.id) ?? createPuppet(user);
    puppet.demo = false;
    puppet.instrumentId = user.instrumentId;
    puppet.chordId = user.chordId;
    puppet.targetEnergy = user.energy;
    puppet.targetShake = user.shake;
    puppet.shakeBurst = Math.max(puppet.shakeBurst * 0.82, user.shake);

    const targetRadius = user.alive ? 48 + user.energy * 28 : 34;
    const scale = targetRadius / puppet.physicsRadius;
    puppet.physicsRadius = targetRadius;
    puppet.radius = targetRadius;
    Body.scale(puppet.body, scale, scale);

    Body.applyForce(puppet.body, puppet.body.position, {
      x: user.tiltX * (0.00042 + user.energy * 0.00052),
      y: -user.tiltY * (0.00042 + user.energy * 0.00052)
    });
  });

  if (emptyState) {
    emptyState.hidden = users.length > 0 || DEMO_PUPPET_COUNT > 0;
  }

  if (userCount) {
    userCount.textContent = `${users.length} muppet${users.length === 1 ? "" : "s"}`;
  }
}

function singPuppet(userId) {
  const puppet = puppets.get(userId);
  if (!puppet) {
    return;
  }

  gsap.timeline({ defaults: { ease: "power2.out" } })
    .to(puppet.anim, { scaleX: 1.2, scaleY: 0.82, mouthOpen: 1, wiggle: 1, duration: 0.12 })
    .to(puppet.anim, { scaleX: 0.9, scaleY: 1.18, mouthOpen: 0.42, wiggle: -0.7, duration: 0.16 })
    .to(puppet.anim, { scaleX: 1, scaleY: 1, mouthOpen: 0, wiggle: 0, duration: 0.34, ease: "elastic.out(1, 0.45)" });
}

// Demo muppets are temporary stand-ins for testing the choir without many phones.
function createDemoPuppets() {
  for (let index = 0; index < DEMO_PUPPET_COUNT; index += 1) {
    const instrumentId = DEMO_INSTRUMENTS[index % DEMO_INSTRUMENTS.length];
    const chordId = DEMO_CHORDS[index % DEMO_CHORDS.length];
    createPuppet({
      id: `demo-${index}`,
      demo: true,
      demoIndex: index,
      instrumentId,
      chordId,
      instrumentLabel: "Demo",
      chordLabel: DEMO_CHORD_LABELS[index % DEMO_CHORD_LABELS.length],
      color: "#ff69bd",
      energy: 0.38 + Math.random() * 0.38,
      alive: true
    });
  }
}

function receive(event) {
  const message = JSON.parse(event.data);

  if (message.state) {
    syncPuppets(message.state.users);
    setPaused(Boolean(message.state.paused));

    if (tdState) {
      tdState.textContent = message.state.touchDesignerConnected
        ? "TouchDesigner conectado"
        : "TouchDesigner sin conectar";
    }
  }

  if (message.type === "bubble.pulse") {
    singPuppet(message.userId);
  }
}

function connect() {
  if (stageSocket) {
    stageSocket.textContent = "Conectando";
  }

  socket = new WebSocket(socketUrl());
  socket.addEventListener("open", () => {
    if (stageSocket) {
      stageSocket.textContent = "En linea";
    }
  });
  socket.addEventListener("message", receive);
  socket.addEventListener("close", () => {
    if (stageSocket) {
      stageSocket.textContent = "Reconectando";
    }
    setTimeout(connect, 1200);
  });
}

// The radial sequencer remains invisible on the projection page but still times the choir.
function updateSequencer(deltaMs) {
  const { width, height } = worldSize();
  const center = stageCenter();
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

function triggerCrossedPuppets() {
  const center = stageCenter();

  for (const puppet of puppets.values()) {
    const distanceFromCenter = Math.hypot(
      puppet.body.position.x - center.x,
      puppet.body.position.y - center.y
    );
    const touchedByWave = Math.abs(distanceFromCenter - sequencerRadius) <= puppet.radius;

    if (touchedByWave && puppet.lastTriggeredCycle !== playheadCycle) {
      puppet.lastTriggeredCycle = playheadCycle;
      if (puppet.demo) {
        send({
          type: "stage.demoTrigger",
          demoId: puppet.id,
          instrumentId: puppet.instrumentId,
          chordId: puppet.chordId,
          energy: puppet.targetEnergy
        });
      } else {
        send({ type: "stage.trigger", userId: puppet.id });
      }
    }
  }
}

function applyAmbientForces(now) {
  for (const puppet of puppets.values()) {
    const windA = Math.sin(now * 0.00055 + puppet.windSeed);
    const windB = Math.cos(now * 0.00042 + puppet.windSeed * 1.7);
    const demoDrift = puppet.demo ? 0.0001 : 0.00004;
    const userDrift = puppet.demo ? 0 : puppet.targetEnergy * 0.00008;
    const shakePush = puppet.demo ? 0 : puppet.shakeBurst * 0.0012;
    const shakeA = Math.sin(now * 0.0018 + puppet.windSeed * 2.3);
    const shakeB = Math.cos(now * 0.0015 + puppet.windSeed * 3.1);

    Body.applyForce(puppet.body, puppet.body.position, {
      x: windA * (demoDrift + userDrift) + shakeA * shakePush,
      y: windB * (demoDrift * 0.8 + userDrift) + shakeB * shakePush
    });
    puppet.shakeBurst *= 0.94;
  }
}

function drawPuppets(now) {
  for (const puppet of puppets.values()) {
    const { x, y } = puppet.body.position;
    const squashX = puppet.anim.scaleX;
    const squashY = puppet.anim.scaleY;
    const wiggle = Math.sin(now * 0.012 + puppet.windSeed) * 3 + puppet.anim.wiggle * 8;

    puppet.group.position = new paper.Point(x, y);
    puppet.group.scaling = new paper.Point(squashX, squashY);
    puppet.group.rotation = wiggle;
    puppet.group.opacity = Math.max(squashX, squashY);
    puppet.mouth.scaling = new paper.Point(1 + puppet.anim.mouthOpen * 0.35, 0.35 + puppet.anim.mouthOpen * 2.5);
  }
}

function togglePause() {
  setPaused(!paused);
  send({ type: "stage.pause", paused });
}

function setPaused(nextPaused) {
  paused = nextPaused;

  if (pauseButton) {
    pauseButton.textContent = paused ? "Reanudar" : "Pausa";
    pauseButton.setAttribute("aria-pressed", String(paused));
  }
}

function render() {
  const now = performance.now();
  const deltaMs = now - lastTime;
  lastTime = now;

  if (!paused) {
    applyAmbientForces(now);
    Engine.update(engine, Math.min(deltaMs, 32));
    updateSequencer(deltaMs);
    triggerCrossedPuppets();
  }

  drawPuppets(now);
  paper.view.update();
  requestAnimationFrame(render);
}

window.addEventListener("resize", () => {
  resizePaperCanvas();
  rebuildBounds();
});
pauseButton?.addEventListener("click", togglePause);

setupPaperCanvas();
rebuildBounds();
createDemoPuppets();
connect();
render();
