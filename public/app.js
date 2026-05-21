const puppetGrid = document.querySelector("#puppetGrid");
const controllerPanel = document.querySelector("#controller");
const notePads = document.querySelector("#notePads");
const socketDot = document.querySelector("#socketDot");
const socketLabel = document.querySelector("#socketLabel");
const touchDesignerState = document.querySelector("#touchDesignerState");
const selectedTitle = document.querySelector("#selectedTitle");
const selectedRole = document.querySelector("#selectedRole");
const selectedHeading = document.querySelector(".section-heading.selected");
const notice = document.querySelector("#notice");
const energyButton = document.querySelector("#energyButton");

let socket;
let state = { puppets: [] };
let selectedPuppetId = null;
let assignedPuppetId = null;
let reconnectTimer = null;
const activePads = new Set();

function socketUrl() {
  const url = new URL("/ws?role=controller", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

function setNotice(message) {
  notice.textContent = message;
}

function setSocketStatus(label, className) {
  socketLabel.textContent = label;
  socketDot.className = `dot ${className}`;
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendControl(message) {
  if (!assignedPuppetId) {
    return;
  }

  send({
    type: "controller.control",
    puppetId: assignedPuppetId,
    ...message
  });
}

function releaseAllNotes() {
  activePads.forEach((padIndex) => {
    sendControl({
      control: "pad",
      padIndex,
      gate: 0,
      velocity: 0
    });
  });
  activePads.clear();
  notePads.querySelectorAll(".is-playing").forEach((pad) => pad.classList.remove("is-playing"));
}

function selectPuppet(puppetId) {
  selectedPuppetId = puppetId;
  send({ type: "controller.join", puppetId });
}

function renderPuppets() {
  puppetGrid.replaceChildren();
  touchDesignerState.textContent = state.touchDesignerConnected
    ? "TouchDesigner conectado"
    : "TouchDesigner sin conectar";

  state.puppets.forEach((puppet) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "puppet-card";
    button.style.setProperty("--puppet-color", puppet.color);
    button.disabled = puppet.occupied && puppet.id !== assignedPuppetId;
    button.innerHTML = `
      <span>Marioneta ${puppet.id}</span>
      <strong>${puppet.role}</strong>
      <span>Track MIDI ${puppet.midiChannel}</span>
      <span class="status-pill">${button.disabled ? "Ocupada" : "Disponible"}</span>
    `;
    button.addEventListener("click", () => selectPuppet(puppet.id));
    puppetGrid.append(button);
  });
}

function renderController(puppetId) {
  const puppet = state.puppets.find((item) => item.id === puppetId);
  if (!puppet) {
    return;
  }

  assignedPuppetId = puppet.id;
  selectedHeading.style.setProperty("--puppet-color", puppet.color);
  controllerPanel.style.setProperty("--puppet-color", puppet.color);
  selectedRole.textContent = puppet.role;
  selectedTitle.textContent = `Marioneta ${puppet.id}`;
  controllerPanel.hidden = false;
  notePads.replaceChildren();

  puppet.pads.forEach((chordPad, padIndex) => {
    const pad = document.createElement("button");
    pad.className = "note-pad";
    pad.type = "button";
    pad.innerHTML = `
      <strong>${chordPad.label}</strong>
      <span>${chordPad.notes.join(" . ")}</span>
    `;
    pad.setAttribute("aria-label", `Acorde ${chordPad.label}, notas MIDI ${chordPad.notes.join(", ")}`);

    let isPlaying = false;
    const gate = (value) => {
      if (isPlaying === Boolean(value)) {
        return;
      }

      isPlaying = Boolean(value);
      if (isPlaying) {
        activePads.add(padIndex);
      } else {
        activePads.delete(padIndex);
      }
      pad.classList.toggle("is-playing", Boolean(value));
      sendControl({
        control: "pad",
        padIndex,
        gate: value,
        velocity: 0.82
      });
    };

    pad.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      pad.setPointerCapture(event.pointerId);
      gate(1);
    });
    pad.addEventListener("pointerup", () => gate(0));
    pad.addEventListener("pointercancel", () => gate(0));
    pad.addEventListener("lostpointercapture", () => gate(0));
    notePads.append(pad);
  });
}

function receive(event) {
  const message = JSON.parse(event.data);
  if (message.state) {
    state = message.state;
    renderPuppets();
  }

  if (message.type === "controller.assigned") {
    renderController(message.puppetId);
    setNotice(`Controlando marioneta ${message.puppetId}.`);
  }

  if (message.type === "server.error" && message.code === "puppet_busy") {
    setNotice(`La marioneta ${message.puppetId} ya tiene controlador.`);
  }

  if (message.type === "server.error" && message.code === "invalid_message") {
    setNotice("El servidor rechazo un control fuera del protocolo.");
  }
}

function connect() {
  clearTimeout(reconnectTimer);
  setSocketStatus("Conectando", "");
  socket = new WebSocket(socketUrl());

  socket.addEventListener("open", () => {
    setSocketStatus("En linea", "online");
    setNotice("Listo para asignar una marioneta.");
    if (selectedPuppetId) {
      selectPuppet(selectedPuppetId);
    }
  });

  socket.addEventListener("message", receive);
  socket.addEventListener("close", () => {
    activePads.clear();
    assignedPuppetId = null;
    setSocketStatus("Reconectando", "offline");
    setNotice("Se perdio la conexion. Reintentando.");
    reconnectTimer = setTimeout(connect, 1200);
  });
}

document.querySelector("#changePuppet").addEventListener("click", () => {
  releaseAllNotes();
  send({ type: "controller.release" });
  assignedPuppetId = null;
  selectedPuppetId = null;
  controllerPanel.hidden = true;
  setNotice("Elige otra marioneta disponible.");
  renderPuppets();
});

function sendEnergy(active) {
  energyButton.classList.toggle("is-active", Boolean(active));
  sendControl({ control: "energy", active });
}

energyButton.addEventListener("pointerdown", (event) => {
  energyButton.setPointerCapture(event.pointerId);
  sendEnergy(1);
});
energyButton.addEventListener("pointerup", () => sendEnergy(0));
energyButton.addEventListener("pointercancel", () => sendEnergy(0));
energyButton.addEventListener("lostpointercapture", () => sendEnergy(0));

window.addEventListener("blur", releaseAllNotes);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseAllNotes();
  }
});

fetch("/api/state")
  .then((response) => response.json())
  .then((snapshot) => {
    state = snapshot;
    renderPuppets();
  });

connect();
