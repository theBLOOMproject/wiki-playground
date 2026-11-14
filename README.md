# wiki-playground

The Learning Center for the Central Oregon Civic Assembly on AI. Every page is a markdown file in `content/pages/`. A build step combines them into one self-contained `index.html`. You can open that file directly or host it anywhere.

> **Don't edit `index.html` by hand.** It gets regenerated. Edit the files in `content/` (or `src/template.html` for the layout, styles and scripts), then rebuild.

## Building

```sh
npm install        # first time only
npm run build      # writes index.html
npm run watch      # rebuilds every time you save a file in content/ or src/
```

If something in a page is wrong, the build stops and tells you which file to fix and what the problem is.

## Where things live

| Path | What it is |
|---|---|
| `content/site.yml` | The sections, page order and short sidebar labels |
| `content/pages/<id>.md` | One file per page. The file name is the page's address (`#<id>`) |
| `content/partials/*.html` | Hand-built figures (the timeline phases, Arnstein's ladder) |
| `content/images/` | Images used in pages |
| `src/template.html` | The page shell: styles, sidebar and the script that runs the site |

**To add a page:** create `content/pages/my-page.md`, then add `- id: my-page` with a `nav:` label to the right section in `content/site.yml`.

**To mark a key page:** add `star: true` under it in `content/site.yml`. It gets an orange star, with an "Important topic" tooltip, in the home page outline and next to the page title. In the page script, each page object has a `star` flag, so other parts of the site can use it too.

## Writing a page

Every page starts with a short header:

```markdown
---
title: "How and when can the public get involved?"
status: draft
---
```

`status` is `draft` (shows the reading time) or `soon` (shows "Coming soon"). Write everything after the header in normal markdown: `## Headings`, `**bold**`, `*italic*`, `[links](https://…)`, `- bullet lists`, `1. numbered lists`, and `| tables |`.

### Editor notes

Wrap a note in curly braces. Notes always show on the page (the site no longer has an on/off switch), so remove them before publishing.

| Write | Shows as |
|---|---|
| `{src: CC Mtg 3, Oct 9}` | an internal source |
| `{check: Confirm the year.}` | **Check** flag |
| `{verify: against policy text}` | **Verify** flag |
| `{team: Need a local example.}` | **Team** flag |
| `{gap: firsthand account from La Pine}` | **Gap** flag |
| `{new: [ORS 197.763](https://…)}` | **New source** flag |
| `{added: Goal 1; add link}` | **Added** flag |

Notes can hold links and other notes. If a note is on a line by itself, it becomes a block note.

### Page building blocks

Start a block with `::: name` and end it with `:::`.

```markdown
::: keypoints
- First key point
- Second key point
:::

::: coming-soon
This page is still being written. It will cover:

- Topic one
- Topic two
:::

::: lead
A larger intro paragraph.
:::

::: lead-strong
**A bold standout paragraph.**
:::

::: sources
*Key Sources: [Name](https://…), [Name](https://…)*
:::

::: wide
| A table | that needs | more room |
| --- | --- | --- |
| … | … | … |
:::

::: cards
- [Case study title](#case-page-id) — One-line description.
:::

::: timeline
1. **2002** What happened that year.
2. **2008 to 2010** What happened next.
:::

::: figure
![Describe the image for screen readers](../images/my-chart.png)

The caption goes here, and it can include [a link](https://…).
:::

::: figure
{{> phases}}

Caption for a hand-built figure from content/partials/.
:::
```

**Fact lists:** a line with a term, followed by a line starting with `: `, makes a "Who had authority" style fact list:

```markdown
The decision
: Whether to welcome large data centers

Who had authority
: City of Prineville and Crook County
```

If none of these covers what you need, you can still write raw HTML inside a page.
