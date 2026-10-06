import assert from "node:assert/strict";
import test from "node:test";
import { reconcileSchedule } from "../scripts/reconcile-schedule.mjs";

const start = "2026-10-01";
const end = "2027-02-21";
const base = {
  date: "2026-10-06",
  title: "Metodyka opracowania dokumentacji projektowej",
  group: "cw/3/ZS",
  type: "exercise",
  startTime: "11:45",
  endTime: "14:45",
};

test("a class removed from the source stays visible as cancelled", () => {
  const result = reconcileSchedule([{ ...base, id: "old" }], [], start, end);
  assert.deepEqual(result, [{ ...base, id: "old", status: "cancelled" }]);
  assert.deepEqual(reconcileSchedule(result, [], start, end), result);
});

test("a class returning to the source becomes active again", () => {
  const previous = [{ ...base, id: "old", status: "cancelled" }];
  assert.deepEqual(reconcileSchedule(previous, [{ ...base, id: "old" }], start, end), [{ ...base, id: "old" }]);
});

test("an edited time or room replaces the old listing without a cancellation", () => {
  const previous = [{ ...base, id: "old", room: "A" }];
  const updated = { ...base, id: "new", startTime: "12:00", endTime: "15:00", room: "B" };
  assert.deepEqual(reconcileSchedule(previous, [updated], start, end), [updated]);
});

test("only the removed session is cancelled when one of two same-day sessions disappears", () => {
  const first = { ...base, id: "first" };
  const second = { ...base, id: "second", startTime: "15:00", endTime: "16:30" };
  assert.deepEqual(reconcileSchedule([first, second], [second], start, end), [{ ...first, status: "cancelled" }, second]);
});
