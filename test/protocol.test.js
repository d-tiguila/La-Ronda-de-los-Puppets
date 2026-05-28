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
    chordId: "g"
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
