import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("prompt page contains a persistent generation status message", () => {
  const html = readFileSync("public/prompts.html", "utf8");

  assert.match(html, /id="generationStatus"/);
  assert.match(html, /提示词生成完成/);
});

test("strict safety rewrite preserves apparel design semantics without risky negative terms", () => {
  const html = readFileSync("public/index.html", "utf8");

  assert.match(html, /hasSensitiveApparel/);
  assert.match(html, /重点忠实呈现原始服装设计/);
  assert.match(html, /深 V 形视觉线条/);
  assert.match(html, /菱形装饰区/);
  assert.match(html, /开放式视觉结构和横向细带/);
  assert.match(html, /酒红色丝绸织物上的俯拍/);
  assert.match(html, /不出现真人穿着或身体姿态/);
  const strictFunction = html.match(/function buildStrictSafePrompt\(text\) \{([\s\S]*?)\n      \}\n\n      function addPhotoDetails/)?.[1] || "";
  assert.doesNotMatch(strictFunction, /no nudity|no erotic tone|no revealing clothing/i);
  assert.doesNotMatch(strictFunction, /buildSafePrompt\(text\)/);
});
