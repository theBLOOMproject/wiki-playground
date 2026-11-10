// Compares each page of scripts/baseline.html (the original) with the built index.html.
// Usage: npm run verify
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const ROOT = path.resolve(import.meta.dirname, "..");
const load = (f) => cheerio.load(fs.readFileSync(path.join(ROOT, f), "utf8"));
const A = load("scripts/baseline.html"), B = load("index.html");

function pages($) {
  const m = {};
  $("article[data-page]").each((_, a) => { m[$(a).attr("data-page")] = a; });
  return m;
}
function profile($, art) {
  const el = $(art);
  const tags = {};
  el.find("*").addBack().each((_, n) => {
    const k = n.name + ((n.attribs.class || "").split(/\s+/).filter(Boolean).sort().map((c) => "." + c).join(""));
    tags[k] = (tags[k] || 0) + 1;
  });
  const attrs = el.find("*").addBack().toArray().flatMap((n) =>
    ["href", "src", "alt", "width", "height", "aria-label", "role", "scope", "id", "data-status", "aria-hidden"]
      .filter((a) => n.attribs[a] != null).map((a) => `${n.name}[${a}=${n.attribs[a].slice(0, 80)}]`)).sort();
  const c = el.clone();
  c.find(".ed, .edw, .ed-block, figure").remove();
  const words = c.text().trim().split(/\s+/).length;
  return { text: el.text().replace(/\s+/g, ""), tags, attrs, words, minutes: Math.max(1, Math.round(words / 220)) };
}
function diffCounts(x, y) {
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => x[k] !== y[k]).map((k) => `${k}: ${x[k] || 0} → ${y[k] || 0}`);
}
function firstDiff(s, t) {
  let i = 0;
  while (i < s.length && s[i] === t[i]) i++;
  return `…${s.slice(Math.max(0, i - 40), i + 40)}…\n      vs\n      …${t.slice(Math.max(0, i - 40), i + 40)}…`;
}

const pa = pages(A), pb = pages(B);
let problems = 0;
const ids = [...new Set([...Object.keys(pa), ...Object.keys(pb)])];
for (const id of ids) {
  if (!pa[id] || !pb[id]) { console.log(`✗ ${id}: only in ${pa[id] ? "baseline" : "build"}`); problems++; continue; }
  const x = profile(A, pa[id]), y = profile(B, pb[id]);
  const issues = [];
  if (x.text !== y.text) issues.push("text differs:\n      " + firstDiff(x.text, y.text));
  const td = diffCounts(x.tags, y.tags);
  if (td.length) issues.push("elements differ: " + td.join(", "));
  const ax = x.attrs.join("\n"), ay = y.attrs.join("\n");
  if (ax !== ay) {
    const sx = new Set(x.attrs), sy = new Set(y.attrs);
    issues.push("attributes differ: -" + x.attrs.filter((v) => !sy.has(v)).join(" -") + " +" + y.attrs.filter((v) => !sx.has(v)).join(" +"));
  }
  if (x.minutes !== y.minutes) issues.push(`reading time ${x.minutes} → ${y.minutes} min (words ${x.words} → ${y.words})`);
  if (issues.length) { problems++; console.log(`✗ ${id}\n    ${issues.join("\n    ")}`); }
  else console.log(`✓ ${id}  (${y.words} words, ${y.minutes} min)`);
}

// Everything outside the articles should be identical (apart from the generated-file banner).
const shell = ($) => { const c = $.root().clone(); c.find("article[data-page]").remove(); return c.html().replace(/<!-- Generated[^>]*-->\n?/, "").replace(/\s+/g, " ")
  .replace(/var SECTIONS = (\[.*?\]);/, (_, j) => `var SECTIONS = ${JSON.stringify(JSON.parse(j).map(({ num, title, single, pages }) => ({ num, title, single: !!single, pages })))};`); };
if (shell(A) !== shell(B)) { problems++; console.log("✗ page shell (head, CSS, sidebar, script) differs:\n      " + firstDiff(shell(A), shell(B))); }
else console.log("✓ page shell (head, CSS, sidebar, script, SECTIONS) identical");

console.log(problems ? `\n${problems} problem(s)` : "\nAll pages match.");
process.exit(problems ? 1 : 0);
