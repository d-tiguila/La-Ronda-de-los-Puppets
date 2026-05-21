import test from "node:test";
import assert from "node:assert/strict";
import { normalizeControl, normalizeJoin } from "../src/lib/protocol.js";

test("accepts valid puppet joins only", () => {
  assert.deepEqual(normalizeJoin({ type: "controller.join", puppetId: 3 }), { puppetId: 3 });
  assert.equal(normalizeJoin({ type: "controller.join", puppetId: 8 }), null);
});

test("maps note indexes to the puppet MIDI notes", () => {
  assert.deepEqual(
    normalizeControl(
      { type: "controller.control", puppetId: 1, control: "note", noteIndex: 3, gate: 1, velocity: 0.9 },
      1
    ),
    { event: "note_on", noteIndex: 3, midiNote: 62, velocity: 0.9 }
  );
});

test("maps chord pad gates to MIDI note groups", () => {
  assert.deepEqual(
    normalizeControl(
      { type: "controller.control", puppetId: 1, control: "pad", padIndex: 4, gate: 1, velocity: 0.82 },
      1
    ),
    { event: "note_on", padIndex: 4, padLabel: "G", midiNotes: [67, 71, 74], velocity: 0.82 }
  );
});

test("clamps parameters and rejects controls from another puppet", () => {
  assert.deepEqual(
    normalizeControl({ type: "controller.control", puppetId: 2, control: "volume", value: 3 }, 2),
    { event: "parameter", parameter: "volume", value: 1 }
  );
  assert.equal(
    normalizeControl({ type: "controller.control", puppetId: 2, control: "effect", value: 0.4 }, 1),
    null
  );
});
