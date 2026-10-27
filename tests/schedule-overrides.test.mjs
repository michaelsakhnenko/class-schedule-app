import assert from "node:assert/strict";
import { test } from "node:test";
import { applyScheduleOverrides } from "../scripts/schedule-overrides.mjs";
import { reconcileSchedule } from "../scripts/reconcile-schedule.mjs";
import { readFile } from "node:fs/promises";

const target = {
  id: "5711e93d07af8d4710ef", date: "2026-10-28",
  startTime: "15:15", endTime: "16:45",
  title: "Zarządzanie sprzedażą z MS Dynamics", type: "exercise", group: "cw/3/ZS",
};

test("moves only the requested exercise while preserving its duration and source ID", () => {
  const unrelated = { ...target, id: "821eb933de3de7f91ffe", type: "seminar", startTime: "13:30", endTime: "15:00" };
  const changedAtSource = { ...target, id: "new-source-id", startTime: "12:00", endTime: "13:30" };
  const result = applyScheduleOverrides([target, unrelated, changedAtSource]);
  assert.deepEqual(result[0], { ...target, startTime: "11:45", endTime: "13:15" });
  assert.deepEqual(result[1], unrelated);
  assert.deepEqual(result[2], changedAtSource);
  assert.equal(target.startTime, "15:15", "source row remains unmodified");
});

test("the scheduled importer applies the correction before reconciling events", async () => {
  const script = await readFile(new URL("../scripts/sync-schedule.mjs", import.meta.url), "utf8");
  assert.match(script, /import \{ applyScheduleOverrides \} from "\.\/schedule-overrides\.mjs";/);
  assert.match(script, /reconcileSchedule\(previous\?\.events \?\? \[\], applyScheduleOverrides\(imported\), start, end\)/);
});

test("the next sync keeps the corrected snapshot without duplicating the class", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../public/schedule.json", import.meta.url), "utf8"));
  const sourceEvents = snapshot.events.map((event) => event.id === target.id ? { ...event, startTime: "15:15", endTime: "16:45" } : event);
  const result = reconcileSchedule(snapshot.events, applyScheduleOverrides(sourceEvents), snapshot.sourceRange.start, snapshot.sourceRange.end);
  assert.deepEqual(result, snapshot.events);
  assert.equal(snapshot.events.find((event) => event.id === target.id)?.startTime, "11:45");
});
