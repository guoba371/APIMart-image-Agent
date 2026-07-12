import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("prompt page contains a persistent generation status message", () => {
  const html = readFileSync("public/prompts.html", "utf8");

  assert.match(html, /id="generationStatus"/);
  assert.match(html, /提示词生成完成/);
});

test("strict safety rewrite rebuilds sensitive apparel prompts without risky negative terms", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /hasSensitiveApparel/);
  assert.match(html, /全程采用无人模特展示/);
  assert.match(html, /不出现人物、人体、皮肤或穿着效果/);
  const strictFunction = html.match(/function buildStrictSafePrompt\(text\) \{([\s\S]*?)\n      \}\n\n      function addPhotoDetails/)?.[1] || "";
  assert.doesNotMatch(strictFunction, /no nudity|no erotic tone|no revealing clothing/i);
  assert.doesNotMatch(strictFunction, /buildSafePrompt\(text\)/);
});
