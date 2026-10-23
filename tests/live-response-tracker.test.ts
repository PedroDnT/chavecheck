import assert from "node:assert/strict";
import test from "node:test";
import { LiveResponseTracker } from "../src/lib/live-response-tracker";

test("response commands remain busy until response.created, including after delegation.created", () => {
  const tracker = new LiveResponseTracker();
  assert.equal(tracker.issued("command-1", 1), true);
  assert.equal(tracker.pendingCount, 1);
  assert.equal(tracker.issued("command-2", 2), false);
  tracker.delegated("delegation-1", "command-1", 2);
  assert.equal(tracker.pendingCount, 1);
  assert.equal(tracker.issued("command-2", 2), false);
  assert.equal(tracker.created("delegation-1", 2), 1);
  assert.equal(tracker.pendingCount, 0);
  assert.equal(tracker.issued("command-2", 2), true);
});

test("late delegation and response events retain the revision before capture", () => {
  const tracker = new LiveResponseTracker();
  tracker.issued("before-capture", 4);
  tracker.delegated("late", "before-capture", 5);
  assert.equal(tracker.created("late", 6), 4);
  assert.equal(tracker.created("late", 7), 4);
});

test("continuations without delegation.created consume the single command and advance its revision", () => {
  const tracker = new LiveResponseTracker();
  tracker.issued("first", 2);
  tracker.delegated("reused", "first", 2);
  assert.equal(tracker.created("reused", 2), 2);
  tracker.issued("continuation", 3);
  assert.equal(tracker.pendingCount, 1);
  assert.equal(tracker.created("reused", 4), 3);
  assert.equal(tracker.pendingCount, 0);
  assert.equal(tracker.created("reused", 5), 3);
});

test("automatic delegation uses its originating revision without consuming another app command", () => {
  const tracker = new LiveResponseTracker();
  tracker.issued("manual", 8);
  tracker.delegated("automatic", undefined, 7);
  assert.equal(tracker.created("automatic", 9), 7);
  assert.equal(tracker.pendingCount, 1);
  tracker.delegated("manual-delegation", "manual", 9);
  assert.equal(tracker.created("manual-delegation", 10), 8);
  assert.equal(tracker.pendingCount, 0);
});

test("an app command bound to another delegation is not consumed by an unrelated response", () => {
  const tracker = new LiveResponseTracker();
  tracker.issued("manual", 1);
  tracker.delegated("manual-delegation", "manual", 2);
  assert.equal(tracker.created("other", 3), 3);
  assert.equal(tracker.pendingCount, 1);
  assert.equal(tracker.created("manual-delegation", 4), 1);
});

test("automatic responses without commands use the saved delegation or current revision", () => {
  const tracker = new LiveResponseTracker();
  tracker.delegated("automatic", undefined, 3);
  assert.equal(tracker.created("automatic", 4), 3);
  assert.equal(tracker.created("automatic", 5), 3);
  assert.equal(tracker.created("unannounced", 6), 6);
  assert.equal(tracker.pendingCount, 0);
});

test("failed commands release only their own lock and delayed events preserve their old revision", () => {
  const tracker = new LiveResponseTracker();
  tracker.issued("failed", 1);
  assert.equal(tracker.failed("unknown"), false);
  assert.equal(tracker.pendingCount, 1);
  assert.equal(tracker.failed("failed"), true);
  assert.equal(tracker.pendingCount, 0);
  tracker.issued("new", 4);
  tracker.delegated("late-failed", "failed", 4);
  assert.equal(tracker.created("late-failed", 5), 1);
  assert.equal(tracker.pendingCount, 1);
  tracker.delegated("new-delegation", "new", 5);
  assert.equal(tracker.created("new-delegation", 6), 4);
});

test("failure after delegation is announced also releases the lock without reclassifying late output", () => {
  const tracker = new LiveResponseTracker();
  tracker.issued("failed", 1);
  tracker.delegated("failed-delegation", "failed", 2);
  assert.equal(tracker.failed("failed"), true);
  tracker.issued("new", 3);
  assert.equal(tracker.created("failed-delegation", 4), 1);
  assert.equal(tracker.pendingCount, 1);
});

test("duplicate delegation events do not reset a completed delegation or release a new command", () => {
  const tracker = new LiveResponseTracker();
  tracker.issued("first", 1);
  tracker.delegated("reused", "first", 2);
  assert.equal(tracker.created("reused", 2), 1);
  tracker.issued("next", 3);
  tracker.delegated("reused", "first", 4);
  assert.equal(tracker.pendingCount, 1);
  assert.equal(tracker.created("reused", 4), 3);
});

test("clear removes commands and delegation revisions for a fresh session", () => {
  const tracker = new LiveResponseTracker();
  tracker.issued("command", 1);
  tracker.delegated("delegation", "command", 2);
  tracker.clear();
  assert.equal(tracker.pendingCount, 0);
  assert.equal(tracker.failed("command"), false);
  assert.equal(tracker.created("delegation", 8), 8);
  assert.equal(tracker.issued("command", 9), true);
  assert.equal(tracker.created("delegation", 10), 9);
});
