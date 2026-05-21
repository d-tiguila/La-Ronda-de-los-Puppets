import { PUPPET_BY_ID } from "../config/puppets.js";

const sliderControls = new Set(["intensity", "volume", "effect", "pitch"]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numberInRange(value, min, max) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return clamp(value, min, max);
}

export function parseJsonMessage(raw) {
  if (typeof raw !== "string" || raw.length > 4096) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function normalizeJoin(message) {
  const puppetId = Number.parseInt(message?.puppetId, 10);
  if (message?.type !== "controller.join" || !PUPPET_BY_ID.has(puppetId)) {
    return null;
  }

  return { puppetId };
}

export function normalizeControl(message, assignedPuppetId) {
  if (message?.type !== "controller.control" || message.puppetId !== assignedPuppetId) {
    return null;
  }

  const puppet = PUPPET_BY_ID.get(assignedPuppetId);
  if (!puppet) {
    return null;
  }

  if (message.control === "note") {
    const noteIndex = Number.parseInt(message.noteIndex, 10);
    const gate = message.gate === 1 ? 1 : message.gate === 0 ? 0 : null;
    const velocity = numberInRange(message.velocity, 0, 1);

    const notes = puppet.pads.flatMap((pad) => pad.notes);
    if (!Number.isInteger(noteIndex) || noteIndex < 0 || noteIndex >= notes.length || gate === null) {
      return null;
    }

    return {
      event: gate ? "note_on" : "note_off",
      noteIndex,
      midiNote: notes[noteIndex],
      velocity: velocity ?? 0.75
    };
  }

  if (message.control === "pad") {
    const padIndex = Number.parseInt(message.padIndex, 10);
    const gate = message.gate === 1 ? 1 : message.gate === 0 ? 0 : null;
    const velocity = numberInRange(message.velocity, 0, 1);
    const pad = puppet.pads[padIndex];

    if (!Number.isInteger(padIndex) || !pad || gate === null) {
      return null;
    }

    return {
      event: gate ? "note_on" : "note_off",
      padIndex,
      padLabel: pad.label,
      midiNotes: pad.notes,
      velocity: velocity ?? 0.82
    };
  }

  if (sliderControls.has(message.control)) {
    const value = numberInRange(message.value, message.control === "pitch" ? -1 : 0, 1);
    if (value === null) {
      return null;
    }

    return {
      event: "parameter",
      parameter: message.control,
      value
    };
  }

  if (message.control === "motion") {
    const x = numberInRange(message.x, 0, 1);
    const y = numberInRange(message.y, 0, 1);
    if (x === null || y === null) {
      return null;
    }

    return {
      event: "motion",
      x,
      y
    };
  }

  if (message.control === "energy") {
    const active = message.active === 1 ? 1 : message.active === 0 ? 0 : null;
    if (active === null) {
      return null;
    }

    return {
      event: "energy",
      active
    };
  }

  return null;
}
