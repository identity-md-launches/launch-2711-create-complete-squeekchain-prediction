/* Declared solid-token contrast only. This does not measure rendered backgrounds or replace axe. */
import { readFile, writeFile } from "node:fs/promises";
const css = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const tokens = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [
    m[1],
    m[2],
  ]),
);
const lum = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const pairs = [
  ["body", "text", "page"],
  ["card question", "text", "surface"],
  ["metadata", "muted", "surface"],
  ["metadata on page", "muted", "page"],
  ["secondary", "text", "raised"],
  ["secondary hover", "text", "hover"],
  ["primary", "accent-ink", "accent"],
  ["primary hover", "accent-ink", "accent-hover"],
  ["Yes", "yes", "yes-bg"],
  ["Yes hover", "yes", "yes-hover"],
  ["No", "no", "no-bg"],
  ["No hover", "no", "no-hover"],
  ["focus", "focus", "surface", 3],
  ["input boundary", "control-line", "surface", 3],
  ["input boundary on page", "control-line", "page", 3],
];
const results = pairs.map(([name, fg, bg, threshold = 4.5]) => {
  const a = lum(tokens[fg]),
    b = lum(tokens[bg]);
  const exact = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return {
    name,
    foreground: tokens[fg],
    background: tokens[bg],
    ratio: Number(exact.toFixed(2)),
    threshold,
    passed: exact >= threshold,
  };
});
const report = {
  method:
    "WCAG relative luminance of declared opaque CSS tokens; not rendered measurement",
  source: "web/src/styles.css",
  results,
  renderedChecksPerformed: false,
};
await writeFile(
  new URL("../../artifacts/contrast.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `${results.filter((r) => r.passed).length}/${results.length} declared contrast pairs pass`,
);
if (results.some((r) => !r.passed)) process.exitCode = 1;
