import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeControllerJoin,
  normalizeControllerMotion,
  normalizeStageTrigger
} from "../src/lib/protocol.js";

test("accepts known instrument joins only", () => {
  assert.deepEqual(normalizeControllerJoin({ type: "user.join", instrumentId: "pulse", chordId: "g" }), {
    instrumentId: "pulse",
    chordId: "g",
    visualSeed: 0
  });
  assert.deepEqual(normalizeControllerJoin({ type: "user.join", instrumentId: "pulse", chordId: "g", visualSeed: 123 }), {
    instrumentId: "pulse",
    chordId: "g",
    visualSeed: 123
  });
  assert.equal(normalizeControllerJoin({ type: "user.join", instrumentId: "unknown" }), null);
  assert.equal(normalizeControllerJoin({ type: "user.join", instrumentId: "pulse", chordId: "bad" }), null);
});

test("normalizes motion values into safe ranges", () => {
  assert.deepEqual(
    normalizeControllerMotion({
      type: "user.motion",
      energy: 2,
      shake: 0.5,
      tiltX: -3,
      tiltY: 0.25
    }),
    {
      energy: 1,
      shake: 0.5,
      tiltX: -1,
      tiltY: 0.25
    }
  );
});

test("accepts stage triggers with user ids", () => {
  assert.deepEqual(normalizeStageTrigger({ type: "stage.trigger", userId: "abc" }), {
    userId: "abc"
  });
  assert.equal(normalizeStageTrigger({ type: "stage.trigger", userId: 123 }), null);
});

test("accepts temporary stage demo triggers", () => {
  assert.deepEqual(
    normalizeStageTrigger({
      type: "stage.demoTrigger",
      demoId: "demo-1",
      instrumentId: "pulse",
      chordId: "g",
      energy: 0.9
    }),
    {
      demo: {
        id: "demo-1",
        controllerId: "stage-demo",
        instrumentId: "pulse",
        instrumentLabel: "Pulso",
        midiChannel: 1,
        chordId: "g",
        chordLabel: "G",
        midiNotes: [67, 71, 74],
        energy: 0.9
      }
    }
  );
  assert.equal(normalizeStageTrigger({ type: "stage.demoTrigger", instrumentId: "bad" }), null);
});
