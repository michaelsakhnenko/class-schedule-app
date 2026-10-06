import assert from "node:assert/strict";
import { test } from "node:test";
import { assessSyncStatus, formatSyncTime, latestTimetableRefresh } from "../src/data/syncStatus.js";

const checkedAt = "2026-10-06T10:17:00.000Z";
const heartbeat = { checkedAt };

test("successful checks remain current during the hourly grace period", () => {
  assert.equal(assessSyncStatus(heartbeat, null, Date.parse(checkedAt) + 94 * 60_000), "current");
  assert.equal(assessSyncStatus(heartbeat, null, Date.parse(checkedAt) + 96 * 60_000), "delayed");
});

test("a newer failed run is distinguished from a missed or delayed run", () => {
  const run = { created_at: "2026-10-06T11:17:00.000Z", status: "completed", conclusion: "failure" };
  assert.equal(assessSyncStatus(heartbeat, run, Date.parse(checkedAt) + 96 * 60_000), "failed");
  assert.equal(assessSyncStatus(heartbeat, { ...run, status: "in_progress", conclusion: null }, Date.parse(checkedAt) + 96 * 60_000), "running");
  assert.equal(assessSyncStatus(heartbeat, { ...run, created_at: "2026-10-06T09:17:00.000Z" }, Date.parse(checkedAt) + 96 * 60_000), "delayed");
});

test("timestamps are shown in Warsaw time", () => {
  assert.match(formatSyncTime(checkedAt), /12:17/);
});

test("UI deployments do not mask the latest timetable refresh", () => {
  const push = { event: "push", conclusion: "success" };
  const scheduled = { event: "schedule", conclusion: "failure" };
  assert.equal(latestTimetableRefresh([push, scheduled]), scheduled);
  assert.equal(latestTimetableRefresh([push]), null);
});
