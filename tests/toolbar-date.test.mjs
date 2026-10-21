import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("week view hides the date range while desktop Day retains its date label", () => {
  assert.match(app, /const showToolbarDate = view === "day" && !isMobile;/);
});
