import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workflow = await readFile(new URL("../.github/workflows/sync-schedule.yml", import.meta.url), "utf8");

test("successful timetable checks persist the heartbeat before deploying", () => {
  assert.match(workflow, /git add public\/schedule\.json public\/sync-status\.json/);
  assert.match(workflow, /if: github\.event_name != 'push'\n\s+run: npm run sync:schedule/);
  const stage = workflow.indexOf("git add public/schedule.json public/sync-status.json");
  const push = workflow.indexOf("git push", stage);
  const build = workflow.indexOf("run: npm run build", stage);
  assert.ok(stage >= 0 && push > stage && build > push, "commit the heartbeat before building the Pages artifact");
});

test("queued code pushes build from the latest committed schedule and heartbeat", () => {
  const sync = workflow.indexOf("run: npm run sync:schedule");
  const refresh = workflow.indexOf("git fetch origin", sync);
  const snapshot = workflow.indexOf("git show FETCH_HEAD:public/schedule.json", refresh);
  const heartbeat = workflow.indexOf("git show FETCH_HEAD:public/sync-status.json", refresh);
  const build = workflow.indexOf("run: npm run build", refresh);
  assert.ok(sync >= 0 && refresh > sync && snapshot > refresh && heartbeat > refresh && build > heartbeat,
    "refresh both committed data files from the latest branch before a push build");
});
