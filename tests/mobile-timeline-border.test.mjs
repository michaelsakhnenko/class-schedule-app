import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("mobile Day has no timeline divider, while Week keeps the vertical divider", () => {
  assert.match(css, /\.day-surface \.time-axis \{ border-right: 0; \}/);
  const weekOverlay = css.match(/\.mobile-week-surface::after \{[^}]+\}/)?.[0];
  assert.ok(weekOverlay, "week overlay should exist");
  assert.match(weekOverlay, /calc\(var\(--week-axis-width\) - 1px\) 0 \/ 1px 100% no-repeat/);
});
