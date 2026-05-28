import { INSTRUMENT_BY_ID, findChord } from "../config/instruments.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeNumber(value, min, max, fallback = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
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

export function normalizeControllerJoin(message) {
  if (message?.type !== "user.join" || !INSTRUMENT_BY_ID.has(message.instrumentId)) {
    return null;
  }

  const instrument = INSTRUMENT_BY_ID.get(message.instrumentId);
  const chordId = typeof message.chordId === "string" ? message.chordId : instrument.chords[0].id;
  if (!instrument.chords.some((chord) => chord.id === chordId)) {
    return null;
  }

  return {
    instrumentId: message.instrumentId,
    chordId
  };
}

export function normalizeControllerMotion(message) {
  if (message?.type !== "user.motion") {
    return null;
  }

  return {
    energy: normalizeNumber(message.energy, 0, 1),
    shake: normalizeNumber(message.shake, 0, 1),
    tiltX: normalizeNumber(message.tiltX, -1, 1),
    tiltY: normalizeNumber(message.tiltY, -1, 1)
  };
}

export function normalizeStageTrigger(message) {
  if (message?.type === "stage.trigger" && typeof message.userId === "string") {
    return {
      userId: message.userId
    };
  }

  if (message?.type === "stage.demoTrigger" && INSTRUMENT_BY_ID.has(message.instrumentId)) {
    const instrument = INSTRUMENT_BY_ID.get(message.instrumentId);
    const chordId = typeof message.chordId === "string" ? message.chordId : instrument.chords[0].id;
    const chord = findChord(instrument, chordId);

    return {
      demo: {
        id: typeof message.demoId === "string" ? message.demoId : `demo-${instrument.id}-${chord.id}`,
        controllerId: "stage-demo",
        instrumentId: instrument.id,
        instrumentLabel: instrument.label,
        midiChannel: instrument.channel,
        chordId: chord.id,
        chordLabel: chord.label,
        midiNotes: chord.notes,
        energy: normalizeNumber(message.energy, 0.15, 1, 0.55)
      }
    };
  }

  return null;
}
