import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("prompt page contains a persistent generation status message", () => {
  const html = readFileSync("public/prompts.html", "utf8");

  assert.match(html, /id="generationStatus"/);
  assert.match(html, /提示词生成完成/);
});
