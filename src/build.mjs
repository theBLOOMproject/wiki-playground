// Builds index.html from content/ (markdown pages) and src/template.html.
// Run with: npm run build   (or npm run watch while editing)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import container from "markdown-it-container";
import deflist from "markdown-it-deflist";
import matter from "gray-matter";
import * as yaml from "js-yaml";
import * as cheerio from "cheerio";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content");
const PAGES_DIR = path.join(CONTENT, "pages");
const PARTIALS_DIR = path.join(CONTENT, "partials");
const TEMPLATE = path.join(ROOT, "src", "template.html");
const OUT = path.join(ROOT, "index.html");

class BuildError extends Error {}
const fail = (msg) => { throw new BuildError(msg); };

// ---------- Editor notes: {src: …} {check: …} {verify: …} {team: …} {gap: …} {new: …} {added: …} ----------
const NOTE_KINDS = {
  src: null,
  check: ["flag-check", "Check"],
  verify: ["flag-check", "Verify"],
  team: ["flag-team", "Team"],
  gap: ["flag-team", "Gap"],
  new: ["flag-new", "New source"],
  added: ["flag-new", "Added"],
};

function editorNotes(md) {
  md.inline.ruler.before("emphasis", "ednote", (state, silent) => {
    const { src } = state;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x7b /* { */) return false;
    const m = /^\{([a-z]+):[ ]?/.exec(src.slice(start, start + 24));
    if (!m) return false;
    if (!(m[1] in NOTE_KINDS)) {
      fail(`Unknown editor note "{${m[1]}: …}". Use one of: ${Object.keys(NOTE_KINDS).map((k) => `{${k}: …}`).join(" ")}`);
    }
    let depth = 0, end = -1;
    for (let i = start; i < state.posMax; i++) {
      const c = src[i];
      if (c === "\\") { i++; continue; }
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end = i; break; }
    }
    if (end < 0) fail(`Editor note "{${m[1]}: …" is missing its closing "}" near: ${src.slice(start, start + 60)}`);
    if (!silent) {
      // A space (or line break) right before a note becomes the toggleable .edw spacer.
      const last = state.tokens[state.tokens.length - 1];
      if (state.pending.endsWith(" ")) {
        state.pending = state.pending.replace(/ +$/, "");
        state.push("ed_space", "", 0);
      } else if (!state.pending && last && last.type === "softbreak") {
        last.type = "ed_space";
      }
      state.push("ed_open", "span", 1).meta = m[1];
      const oldMax = state.posMax;
      state.pos = start + m[0].length;
      state.posMax = end;
      state.md.inline.tokenize(state);
      state.posMax = oldMax;
      state.push("ed_close", "span", -1);
    }
    state.pos = end + 1;
    return true;
  });
  md.renderer.rules.ed_space = () => '<span class="edw"> </span>';
  md.renderer.rules.ed_open = (tokens, idx) => {
    const kind = NOTE_KINDS[tokens[idx].meta];
    return kind ? `<span class="ed flag ${kind[0]}"><b>${kind[1]}</b> ` : '<span class="ed src">';
  };
  md.renderer.rules.ed_close = () => "</span>";
}

// ---------- Block containers: ::: name … ::: ----------
const CONTAINERS = ["keypoints", "coming-soon", "lead", "lead-strong", "sources", "wide", "cards", "timeline", "figure", "home-note"];

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
md.use(deflist).use(editorNotes);
for (const name of CONTAINERS) {
  md.use(container, name, {
    render: (tokens, idx) => (tokens[idx].nesting === 1 ? `<div data-c="${name}">\n` : "</div>\n"),
  });
}

// ---------- HTML post-processing into the site's components ----------
function pngSize(buf) {
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG") return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  return null;
}
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };

function partial(name) {
  const file = path.join(PARTIALS_DIR, name + ".html");
  if (!fs.existsSync(file)) fail(`Missing partial "{{> ${name}}}" (expected content/partials/${name}.html)`);
  return fs.readFileSync(file, "utf8").trim();
}

function transform(html) {
  const $ = cheerio.load(html, null, false);
  const PARTIAL_RE = /^\{\{>\s*([\w-]+)\s*\}\}$/;

  // {{> name}} on its own line
  $("p").each((_, p) => {
    const m = PARTIAL_RE.exec($(p).text().trim());
    if (m && $(p).children().length === 0) $(p).replaceWith(partial(m[1]));
  });

  // Images → inline data URIs (keeps index.html self-contained)
  $("img").each((_, img) => {
    const src = $(img).attr("src") || "";
    if (/^(data:|https?:)/.test(src)) return;
    const file = path.resolve(PAGES_DIR, decodeURI(src));
    if (!fs.existsSync(file)) fail(`Missing image "${src}" (looked for ${path.relative(ROOT, file)})`);
    const buf = fs.readFileSync(file);
    const mime = MIME[path.extname(file).toLowerCase()] || fail(`Unsupported image type: ${src}`);
    const size = pngSize(buf);
    $(img).attr("src", `data:${mime};base64,${buf.toString("base64")}`);
    if (size) $(img).attr("width", String(size[0])).attr("height", String(size[1]));
  });

  // A paragraph containing only an editor note is a block note
  $("p").each((_, p) => {
    const kids = $(p).contents().toArray().filter((n) => !(n.type === "text" && !n.data.trim()));
    if (kids.length === 1 && $(kids[0]).is("span.ed")) $(p).addClass("ed-block");
  });

  $("dl").addClass("facts");
  $("thead th").attr("scope", "col");

  // Tables: ::: wide first, then wrap the rest
  $('div[data-c="wide"]').each((_, d) => {
    $(d).find("table").wrap('<div class="table-wrap wide-table"></div>');
    $(d).replaceWith($(d).contents());
  });
  $("table").each((_, t) => {
    if (!$(t).parent().hasClass("table-wrap")) $(t).wrap('<div class="table-wrap"></div>');
  });

  // Paragraph styles
  for (const cls of ["lead", "lead-strong", "sources"]) {
    $(`div[data-c="${cls}"]`).each((_, d) => {
      $(d).children("p").addClass(cls);
      $(d).replaceWith($(d).contents());
    });
  }

  $('div[data-c="keypoints"]').each((_, d) => {
    $(d).replaceWith(`<section class="keypoints" aria-label="Key points"><h2>Key points</h2>${$(d).html().trim()}</section>`);
  });

  $('div[data-c="coming-soon"]').each((_, d) => {
    $(d).replaceWith(`<div class="soon-card"><p class="soon-title">Coming soon</p>${$(d).html().trim()}</div>`);
  });

  // ::: cards   - [Title](#page) — description
  $('div[data-c="cards"]').each((_, d) => {
    const cards = $(d).find("li").map((_, li) => {
      const a = $(li).children("a").first();
      if (!a.length) fail(`Each item inside "::: cards" must start with a link, like: - [Title](#page-id) — description`);
      const title = a.html();
      const href = a.attr("href");
      a.remove();
      const desc = ($(li).html() || "").trim().replace(/^(—|–|-|:)\s*/, "");
      return `<a class="case-card" href="${href}"><span class="cc-title">${title}</span><span class="cc-desc">${desc}</span></a>`;
    }).get();
    $(d).replaceWith(`<div class="case-cards">${cards.join("")}</div>`);
  });

  // ::: timeline   1. **When** what happened
  $('div[data-c="timeline"]').each((_, d) => {
    const list = $(d).children("ol, ul").first();
    list.children("li").each((_, li) => {
      const first = $(li).children().first();
      if (first.is("strong") && li.children[0] === first[0]) {
        first.replaceWith(`<span class="when">${first.html()}</span>`);
        const next = $(li).find("span.when")[0].nextSibling;
        if (next && next.type === "text") next.data = next.data.replace(/^\s+/, "");
      }
    });
    $(d).replaceWith(`<ol class="tl">${list.html()}</ol>`);
  });

  // ::: figure   image or {{> partial}}, then a caption paragraph
  $('div[data-c="figure"]').each((_, d) => {
    const $d = $(d);
    $d.children("p").each((_, p) => {
      const only = $(p).children();
      if (only.length === 1 && only.is("img") && !$(p).text().trim()) $(p).replaceWith(`<div class="figure-img">${$.html(only)}</div>`);
    });
    const cap = $d.children("p").last();
    if (cap.length) cap.replaceWith(`<figcaption>${cap.html()}</figcaption>`);
    $d.replaceWith(`<figure>${$d.html().trim()}</figure>`);
  });

  const leftover = $('div[data-c]:not([data-c="home-note"])').first();
  if (leftover.length) fail(`"::: ${leftover.attr("data-c")}" is not allowed here`);
  return $.html().trim();
}

// ---------- Pages ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function loadPage(id) {
  const file = path.join(PAGES_DIR, id + ".md");
  if (!fs.existsSync(file)) fail(`Page "${id}" is listed in content/site.yml but content/pages/${id}.md does not exist`);
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  if (!data.title) fail(`content/pages/${id}.md needs a "title:" at the top`);
  return { id, file, data, content };
}

function renderBody(page) {
  try {
    return transform(md.render(page.content));
  } catch (e) {
    if (e instanceof BuildError) fail(`content/pages/${page.id}.md: ${e.message}`);
    throw e;
  }
}

function renderHome(page, firstDraftId, askUrl) {
  const $ = cheerio.load(renderBody(page), null, false);
  const note = $('div[data-c="home-note"]');
  const noteHtml = note.length ? note.html().trim() : "";
  note.remove();
  $.root().children("p").addClass("home-desc");
  return `<article data-page="home" hidden>
  <h1 class="home-title">${esc(page.data.title)}</h1>
  ${page.data.subtitle ? `<p class="home-sub">${esc(page.data.subtitle)}</p>` : ""}
  ${$.html().trim()}
  <div class="home-actions">
    <a class="btn" href="#${firstDraftId}">Start reading <span aria-hidden="true">→</span></a>
    ${askUrl ? `<a class="btn btn-ask" href="${esc(askUrl)}"><svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.2" fill="currentColor"/><path d="M6.2 6.2a1.9 1.9 0 0 1 3.7.5c0 1.3-1.9 1.6-1.9 2.8" fill="none" style="stroke: var(--ask-q)" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="11.7" r="1" style="fill: var(--ask-q)"/></svg>Ask a question</a>` : ""}
  </div>
  <div class="outline" id="outline"></div>
  ${noteHtml ? `<div class="home-note">${noteHtml}</div>` : ""}
</article>`;
}

const STATUSES = ["draft", "soon", "notes"];
function renderArticle(page) {
  const status = page.data.status || "draft";
  if (!STATUSES.includes(status)) fail(`content/pages/${page.id}.md: status must be one of ${STATUSES.join(", ")} (got "${status}")`);
  const body = renderBody(page);
  if (body.includes('data-c="home-note"')) fail(`content/pages/${page.id}.md: "::: home-note" only works on the home page`);
  return `<article data-page="${page.id}" data-status="${status}" hidden>
<h1>${esc(page.data.title)}</h1>
${body}
</article>`;
}

export function build() {
  const site = yaml.load(fs.readFileSync(path.join(CONTENT, "site.yml"), "utf8"));
  const sections = site.sections || fail("content/site.yml needs a sections: list");
  const unlisted = site.unlisted || [];

  const seen = new Set(["home"]);
  const SECTIONS = sections.map((s, i) => {
    if (!s.title || !Array.isArray(s.pages) || !s.pages.length) fail(`content/site.yml: section ${i + 1} needs a title and at least one page`);
    return {
      num: i + 1,
      title: s.title,
      ...(s.single ? { single: true } : {}),
      pages: s.pages.map((p) => {
        if (!p.id || !p.nav) fail(`content/site.yml: every page needs an id and a nav label (section "${s.title}")`);
        if (seen.has(p.id)) fail(`content/site.yml: page "${p.id}" is listed twice`);
        seen.add(p.id);
        return { id: p.id, nav: p.nav, ...(p.sub ? { sub: true } : {}), ...(p.star ? { star: true } : {}) };
      }),
    };
  });
  unlisted.forEach((id) => seen.add(id));

  const onDisk = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
  const stray = onDisk.filter((id) => !seen.has(id));
  if (stray.length) fail(`These pages aren't listed in content/site.yml: ${stray.map((id) => `content/pages/${id}.md`).join(", ")}`);

  const ordered = SECTIONS.flatMap((s) => s.pages.map((p) => loadPage(p.id)));
  const firstDraft = ordered.find((p) => (p.data.status || "draft") === "draft") || ordered[0];
  const articles = [
    renderHome(loadPage("home"), firstDraft.id, site.ask_url),
    ...ordered.map(renderArticle),
    ...unlisted.map((id) => renderArticle(loadPage(id))),
  ];

  const template = fs.readFileSync(TEMPLATE, "utf8");
  for (const marker of ["<!-- ARTICLES -->", "/* SECTIONS */[]"]) {
    if (!template.includes(marker)) fail(`src/template.html is missing the ${marker} placeholder`);
  }
  const out = template
    .replace("<!-- ARTICLES -->", () => articles.join("\n"))
    .replace("/* SECTIONS */[]", () => JSON.stringify(SECTIONS))
    .replaceAll("{{ASK_URL}}", () => esc(site.ask_url || "#"));
  fs.writeFileSync(OUT, out);
  return { pages: articles.length, bytes: out.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { pages, bytes } = build();
    console.log(`Built index.html: ${pages} pages, ${(bytes / 1024).toFixed(0)} KB`);
  } catch (e) {
    if (e instanceof BuildError) {
      console.error(`\nBuild failed: ${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }
}
