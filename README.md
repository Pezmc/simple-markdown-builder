# simple-markdown-builder

![xkcd 927: Standards](https://imgs.xkcd.com/comics/standards.png)

*Yet another markdown site generator* (because [Jekyll](https://jekyllrb.com/), [Hugo](https://gohugo.io/), [11ty](https://www.11ty.dev/), [Astro](https://astro.build/), [Next.js](https://nextjs.org/), [Gatsby](https://www.gatsbyjs.com/), [VitePress](https://vitepress.dev/), [Docusaurus](https://docusaurus.io/), [MkDocs](https://www.mkdocs.org/), [MkDocs Material](https://squidfunk.github.io/mkdocs-material/), [GitBook](https://www.gitbook.com/), [Docus](https://docus.dev/), [VuePress](https://vuepress.vuejs.org/), and [Nuxt Content](https://content.nuxtjs.org/) weren't enough)

A simple markdown-to-HTML site builder with optional translations.

## Installation

```bash
bun add simple-markdown-builder
```

## Usage

### CLI

Put the site config in `smb.config.ts` at the project root:

```typescript
import path from 'node:path'
import { defineConfig } from 'simple-markdown-builder'

export default defineConfig({
  baseUrl: 'https://aerialyoga.example.com',
  templatePath: 'scripts/template.html',
  defaultMeta: {
    title: 'Aerial Yoga Studio',
    description: 'Aerial yoga classes and equipment',
    sidebarTitle: 'Aerial Yoga Studio',
    sidebarSummary: 'Welcome to our aerial yoga studio',
    backLinkHref: '/',
    backLinkLabel: 'Back to home',
  },
})
```

Then build or serve it:

```bash
bunx smb build                    # build once into outputDir (default: docs)
bunx smb build --clean            # remove generated HTML first
bunx smb build --skip-link-check  # skip the broken-link check
bunx smb dev                      # build, watch and serve on $PORT, else 4173
bunx smb dev --port 3000 --clean
bunx smb build --config site.config.ts
bunx smb --help
```

The CLI runs on Bun and loads the config's default export with `import()`, so the config can import helpers and set the build hooks below. Relative paths in it (`contentDir`, `outputDir`, `templatePath`, …) resolve against the working directory, not the config file. `--clean` and `--skip-link-check` only switch behaviour on: they never turn off `clean` or `skipLinkCheck` set in the config.

Typical `package.json` scripts:

```json
{
  "scripts": {
    "dev": "smb dev",
    "build:pages": "smb build"
  }
}
```

### Programmatic API

The CLI is a thin wrapper over `build` and `startDevServer`, which stay exported for custom scripts.

```typescript
import { build } from 'simple-markdown-builder'
import config from './smb.config.ts'

await build(config)
```

### With Translations

```typescript
import { build, ensureTranslations } from 'simple-markdown-builder'

const config = {
  baseUrl: 'https://aerialyoga.example.com',
  templatePath: 'scripts/template.html',
  defaultMeta: { /* ... */ },
  translations: {
    apiKey: process.env.DEEPL_API_KEY,
    targetLanguages: ['fr', 'nl'],
    defaultLang: 'en',
    supportedLangs: ['en', 'fr', 'nl'],
    customGlossary: {
      fr: {
        'aerial silks': 'soies aériennes',
      },
    },
  },
}

await ensureTranslations(config, 'content', false)
await build(config)
```

A translated page joins its source's group through `translationOf`. A bare value names a page in the same directory once the language directory is removed, so `fr/classes/index.md` with `translationOf: index` pairs with `classes/index.md`. A value containing `/` is a path from the content root, for translations that live in a different directory: `fr/infos/a-propos.md` with `translationOf: /about` pairs with `about.md`. `ensureTranslations` writes the bare form, which always matches because it mirrors the source's directory.

### Development Server

```typescript
import { startDevServer } from 'simple-markdown-builder'

await startDevServer(config, {
  port: 4173,
  outputDir: 'docs',
  clean: true, // Optional: clean HTML files before building
  refreshTranslations: false, // Optional: refresh translations on start
})
```

### Configuration Options

- `contentDir` - Source markdown directory (default: `content`)
- `outputDir` - Output HTML directory (default: `docs`)
- `baseUrl` - Base URL for absolute links (required)
- `defaultMeta` - Default front matter values (required)
- `templatePath` - Path to HTML template file (required)
- `homepageTemplatePath` - Optional separate template for homepage
- `markdownOptions` - MarkdownIt configuration options
- `translations` - Translation config: `false` to disable, or object with DeepL settings
- `utmParams` - UTM parameters object for external links
- `noreferrer` - Add `noreferrer` to the `rel` of external links (default: `false`, emits `rel="noopener"` so destinations still see your origin as the referrer). Only applies when `utmParams` is set, since external links are rewritten by the UTM pass
- `skipLinkCheck` - Whether to skip link validation
- `linkCheck` - Turn individual link checks on or off (see [Link Checking](#link-checking))
- `redirects` - Redirect stubs for moved pages (see [Redirects](#redirects))
- `translationFallback` - Set to `'redirect'` to write a stub for every missing translation (see [Redirects](#redirects))
- `renderRedirect` - Optional function that returns the HTML of each redirect stub
- `clean` - Clean HTML files from output directory before building (default: `false`)
- `onPageRendered` - Optional hook to rewrite each page's HTML before it is written (see below)
- `onPagesWritten` - Optional hook that runs once every page is written, before the link check (see below)
- `lastmod` - `'git'` to date each page from its source file's last commit, or `false` (default). See [Last-modified dates](#last-modified-dates)
- `jsonLd` - Optional hook returning JSON-LD structured data for a page. See [Structured data](#structured-data-json-ld)
- `robots` - `true` or `{ disallow: [...] }` to generate `robots.txt`; `false` (default) leaves it alone. See [robots.txt](#robotstxt)

### Build Hooks

`onPageRendered(html, plan, { plans, groups })` receives each page's rendered HTML and returns the HTML to write. `plans` is every page in the build and `groups` maps each translation group key (the page's path without its language directory, e.g. `classes/index`) to its pages, so the hook can add cross-page navigation. Pages render concurrently, so the hook must not depend on the order it is called in.

`onPagesWritten(plans, outputDir)` runs after every page and [redirect stub](#redirects) is written and before the link check, even when `skipLinkCheck` is set. Write extra files here that the rewritten pages link to. Files written here are link-checked but stay out of the sitemap, which is built from `plans`.

Both hooks may be async. `startDevServer` calls `build()`, so watch mode runs them on every rebuild.

```typescript
await build({
  ...config,
  onPageRendered: (html, plan, { groups }) => html.replace('</main>', `${renderNav(plan, groups)}</main>`),
  onPagesWritten: async (plans, outputDir) => {
    await writeFile(path.join(outputDir, 'events.json'), JSON.stringify(listEvents(plans)))
  },
})
```

Custom front-matter keys pass through onto `plan.meta` (`eyebrow: Welcome` is `plan.meta.eyebrow`). Their values are strings.

The builder's own slug helpers are exported, so a hook can map outputs back to sources with the same rules: `sanitizeSlug`, `foldAccents` and `slugifyAnchor` (the heading-anchor slugifier).

### Redirects

`redirects` writes a stub page at each old path that sends visitors on to the new one:

```typescript
await build({
  ...config,
  redirects: [
    { from: '/fr/le-ons-particuli-res', to: '/fr/cours-particuliers' },
    { from: '/shop', to: 'https://shop.example.com' },
  ],
})
```

Each stub is written to `<from>.html` (`/guides/` writes `guides/index.html`) and carries a `<meta http-equiv="refresh">` to `to`, a `rel="canonical"` with the target's absolute URL, `<meta name="robots" content="noindex, follow">` and a visible link. `to` is a site path starting with `/` or an `http(s)://` URL.

`translationFallback: 'redirect'` writes a stub for every default-language page that has no translation in one of `supportedLangs`. With `about.md` and no `nl/about.md`, `nl/about.html` redirects to `/about`, so a language switcher or nav that always links `/nl/...` never 404s. A translation in another language does not stop it: each missing language gets its own stub. Pages with no default-language version get no fallback, since there is nothing to redirect to. When several default-language pages share a slug (`index.md` and `guides/index.md`), a page counts as translated only if the translation sits at the mirrored path (`fr/guides/index.html`).

The build fails, before any page is written, when:

- a `from` is the output of a real page (compared case-insensitively, since `About.html` and `about.html` are one file on macOS and Windows; repeated slashes collapse),
- two redirects (explicit or fallback) write the same path,
- an internal `to` is not a page built from `content/` (a static file such as `/files/guide.pdf`, or another redirect stub, does not count),
- a `from` is an absolute URL, has a query or fragment, contains `.` or `..` segments, or ends in an extension other than `.html` (a stub for `/old.htm` would be written to `old.html` and `/old.htm` would still 404).

Stubs are written after the pages and before `onPagesWritten`, and are link-checked like any page. They are not in `plans`, so they stay out of `sitemap.xml`, hreflang alternates, the language switcher and the hook context. A link to a stub is valid; its `#fragment` is not checked, since a meta refresh drops it. The dev server serves stubs like any other page.

To localise the stub, pass `renderRedirect`. It receives `{ from, to, lang, reason }` and returns the whole HTML document. `from` is the stub's site path (`/nl/about`), `lang` is the stub's language (the first path segment when it is one of `supportedLangs`, else the default language), and `reason` is `'moved'` for `redirects` and `'untranslated'` for fallbacks:

```typescript
renderRedirect: ({ to, lang, reason }) => `<!DOCTYPE html>
<html lang="${lang}"><head>
  <meta name="robots" content="noindex, follow" />
  <meta http-equiv="refresh" content="0; url=${to}" />
  <link rel="canonical" href="${to.startsWith('/') ? `https://example.com${to}` : to}" />
</head><body><a href="${to}">${MESSAGES[lang][reason]}</a></body></html>`,
```

A custom stub must carry its own refresh, canonical and robots tags.

### Link Checking

After the build, every generated HTML file in `outputDir` is checked (skip all of it with `skipLinkCheck: true`):

- **Links** (always on): every `href="..."` that is not external, `mailto:`, `tel:`, `javascript:` or `data:` must resolve to a file, as is, with `.html`, or as `index.html`. A `#fragment`, on the same page or another, must match an `id` on the target page.
- **Assets** (`linkCheck.assets`, default on): every local `src` and `srcset` URL, single- or double-quoted, (images, scripts, `<source>`) must resolve to a file. A bare relative URL may sit next to the page or at the site root. URLs with a scheme (`https:`, `data:`, `blob:`, `about:`) and protocol-relative URLs are skipped, as are `data-src` and `data-srcset`.
- **Translation siblings** (`linkCheck.translationSiblings`, default off): every page whose translation group has other languages must link to one page in each of them with an `<a href>`. The hreflang `<link>` tags in the head do not count. This catches a template that dropped `{{LANGUAGE_SWITCHER}}`. Absolute links on `baseUrl` count as internal here.

```typescript
await build({
  ...config,
  linkCheck: { assets: true, translationSiblings: true },
})
```

Each failure names the href, the source file and the path it resolved to:

```
Broken asset references found:
- /img/missing.png from docs/about.html -> missing docs/img/missing.png
Translated pages missing a link to a sibling translation:
- /fr/about from docs/about.html -> missing docs/fr/about.html
```

### Template Placeholders

Templates support these placeholders:
- `{{TITLE}}` - Page title
- `{{DESCRIPTION}}` - Page description
- `{{BODY}}` - Rendered HTML body
- `{{LANGUAGE_SWITCHER}}` - Language switcher (see below)
- `{{LANG}}` - Current page language code
- `{{BACK_LINK_HREF}}` - Back link URL
- `{{BACK_LINK_LABEL}}` - Back link text
- `{{SIDEBAR_TITLE}}` - Sidebar title
- `{{SIDEBAR_SUMMARY}}` - Sidebar summary
- `{{YEAR}}` - Current year
- `{{UPDATED}}` - The page's last-modified date, formatted for the page's language with `Intl.DateTimeFormat` (`November 1, 2026` for `en`, `1 novembre 2026` for `fr`). Empty when the page has no date
- `{{UPDATED_ISO}}` - The same date as `YYYY-MM-DD`, for `<time datetime="...">`. Empty when the page has no date

Both date placeholders need `lastmod: 'git'`. Since they are empty without a date, wrap them in markup that still reads well when empty, or check `plan.meta.lastModified` in `onPageRendered`.

`{{LANGUAGE_SWITCHER}}` renders only when a page has more than one language. It carries no styling, only class names to style:

```html
<nav class="smb-lang-switch" aria-label="Language"><a href="/about" hreflang="en" class="smb-lang-switch__item">EN</a><span class="smb-lang-switch__item is-active" aria-current="page">FR</span></nav>
```

### Homepages

`homepageTemplatePath` applies to `index.html` and to each language's index (`fr/index.html`, `nl/index.html`) for every language in `supportedLangs`. Other `index.html` files, such as `guides/index.html`, use the normal template.

### Open Graph and Twitter Images

Images can be set in two ways:
1. **Default for all pages**: Set in `defaultMeta` configuration
2. **Per-page**: Set in the page's front-matter

**ogImage**: Used for Open Graph tags. If not provided, a warning is logged and the tag is omitted.

**twitterImage**: Used for Twitter Card image. Only set if explicitly provided (no fallback to ogImage).

Example:

```typescript
await build({
  baseUrl: 'https://example.com',
  templatePath: 'template.html',
  defaultMeta: {
    title: 'My Site',
    description: 'Site description',
    ogImage: 'img/default-og.png', // Default for all pages
    twitterImage: 'img/default-twitter.png', // Optional
    // ... other meta fields
  },
})
```

Or per-page in front-matter:

```markdown
---
title: My Page
ogImage: img/page-specific-og.png
twitterImage: img/page-specific-twitter.png
---
```

### Head Tags

Every page gets these tags injected before `</head>`:

- `description`, `rel="canonical"` (not on 404 pages)
- `og:type` (`website`, or the front-matter `ogType`, e.g. `ogType: article`), `og:url`, `og:title`, `og:description`
- `og:locale` from the page language as Open Graph's `language_TERRITORY`, filling a bare language with its likely region (`en` becomes `en_US`, `fr` becomes `fr_FR`, `pt-br` becomes `pt_BR`), plus `og:locale:alternate` for each other language the page is translated into
- `og:image`, followed by `og:image:width` and `og:image:height` when `ogImageWidth` / `ogImageHeight` are set in front-matter or `defaultMeta` (as strings, e.g. `ogImageWidth: '1200'`). The size tags are only emitted with an `og:image`
- Twitter Card tags
- `<link rel="alternate" hreflang="...">` for each translation, plus `hreflang="x-default"` pointing at the default-language version
- `<meta name="robots" content="noindex, nofollow">` for `noindex` pages and 404 pages

### Last-modified dates

With `lastmod: 'git'`, each page's date is the committer date of the last commit touching its source markdown file. It is exposed as `plan.meta.lastModified` (`YYYY-MM-DD`), written as `<lastmod>` in `sitemap.xml`, and fills `{{UPDATED}}` / `{{UPDATED_ISO}}`. The dates come from a single `git log` over the content directory, not one call per page.

Git is the only source: a `lastModified` key in front-matter is ignored. A page whose file has no commit yet (new or untracked) has no date. An edited but uncommitted file keeps its last commit's date. Outside a git repository, or in a shallow clone, the builder warns once and omits every date; the build never fails over it.

GitHub Actions' `actions/checkout` makes a shallow clone by default, so fetch the full history in the deploy workflow:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
```

### Structured data (JSON-LD)

`jsonLd(plan, { plans, groups })` returns an object, an array of objects, or `undefined` for each page. The result is injected before `</head>` as `<script type="application/ld+json">`, with `<` escaped so the data cannot close the script element. Without the hook, no JSON-LD is emitted: the builder invents no schemas.

```typescript
await build({
  ...config,
  lastmod: 'git',
  jsonLd: (plan) => ({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: plan.meta.title,
    inLanguage: plan.meta.lang,
    ...(plan.meta.lastModified ? { dateModified: plan.meta.lastModified } : {}),
  }),
})
```

The hook runs before `onPageRendered`.

### robots.txt

With `robots: true` (or `robots: { disallow: ['/drafts/'] }`) the builder writes `robots.txt`:

```text
# Generated by simple-markdown-builder
User-agent: *
Allow: /
Disallow: /drafts/

Sitemap: https://example.com/sitemap.xml
```

`disallow` entries are written verbatim. `Allow: /` is left out when `disallow` contains `/`, since an equally specific `Allow` would override it. `noindex` pages and 404 pages are deliberately not disallowed: a crawler blocked by robots.txt never fetches the page, so it never sees the noindex tag, and a URL other sites link to can stay in search results.

The first line marks the file as generated. If `outputDir` already holds a `robots.txt` without that marker, the build fails instead of overwriting it; delete the file or leave `robots` off. The default, `false`, never touches `robots.txt`.

### 404 Page

`content/404.md` builds to `404.html`, which GitHub Pages serves for any missing URL. The builder recognises `404.html` and `<lang>/404.html` (for each language in `supportedLangs`) by their output name, with no extra config:

- They are `noindex`, have no `rel="canonical"`, and are left out of `sitemap.xml` and of hreflang tags, the language switcher included.
- The page is served at whatever URL was missing, at any depth, so relative URLs in it break. The build warns when the rendered 404 page, template included, has an `href`, `src` or `srcset` that is not root-relative (`/...`), absolute, or a `#fragment`.
- The dev server answers missing URLs with `404.html` and status 404 when it exists.
- The link checker checks the 404 page's links like any other page.

GitHub Pages only serves the root `404.html`. Language-specific pages such as `fr/404.html` are built, but nothing serves them automatically at missing French URLs; link to them from the root 404 page or route to them with your host's own rules.

### Changes in v3.1

New and opt-in: `lastmod`, `jsonLd`, `robots`, the `{{UPDATED}}` / `{{UPDATED_ISO}}` placeholders, `ogType`, `ogImageWidth` and `ogImageHeight`.

These change the output of existing sites without any config change:

- **x-default hreflang**: pages now emit `<link rel="alternate" hreflang="x-default">`. Every translation in a group points it at the default-language version, or the first language with a version when there is none (before, `buildAlternateLinks` pointed each page's x-default at the page itself).
- **og:type and og:locale**: every page gets `og:type` (`website` unless `ogType` is set), `og:locale`, and `og:locale:alternate` for its translations.
- **404 pages**: `404.html` and `<lang>/404.html` are now `noindex`, drop their canonical and hreflang tags, leave the sitemap, and log a warning for relative URLs. The dev server serves `404.html` for missing URLs instead of a plain "Not found".
- **Translation groups follow the page's path**: hreflang alternates, canonical tags and sitemap alternates used to group pages on the bare slug, so every `index.md` (`index.md`, `classes/index.md`, `fr/classes/index.md`) landed in one group, as did `classes/beginner.md` and `workshops/beginner.md`. The homepage could list `/classes/` as an alternate. Pages now group on their path without the language directory (`classes/index`). To migrate: translated files written by `ensureTranslations` keep working unchanged. A hand-written `translationOf` that points at a page in a different directory needs the path form: `fr/cours/debutant.md` translating `classes/beginner.md` changes from `translationOf: beginner` to `translationOf: classes/beginner`. Hooks that look up `groups` by key must use the new path keys (`classes/index`, not `index`).

### Breaking Changes in v1.0

**Template Placeholders Removed**: The following placeholders are no longer needed - meta tags are automatically injected:
- `{{OG_URL}}`, `{{OG_TITLE}}`, `{{OG_DESCRIPTION}}`, `{{OG_IMAGE}}`
- `{{TWITTER_TITLE}}`, `{{TWITTER_DESCRIPTION}}`, `{{TWITTER_IMAGE}}`
- `{{CANONICAL_URL}}`, `{{HREFLANG_LINKS}}`, `{{NOINDEX}}`, `{{META_TAGS}}`

**Note**: `{{DESCRIPTION}}` is still available as a template placeholder for use in the body content, but the meta description tag is automatically injected in the head.

**Migration**: Remove these placeholders from your templates. Ensure your template has a `</head>` tag - all meta tags will be automatically injected before it.

### UTM Parameters

UTM parameters are provided as an object:

```typescript
{
  utmParams: {
    utm_campaign: 'mycampaign',
    utm_medium: 'website',
    utm_source: 'mysite',
  },
}
```

These are automatically inserted into external links, before any `#fragment`. External links also get `target="_blank" rel="noopener"`; set `noreferrer: true` to emit `rel="noopener noreferrer"` instead. Without `utmParams`, external links are left exactly as markdown renders them.

### Slugs and File Paths

Slugs default to the filename (without extension). Directory structure is automatically preserved in the output:

- `content/index.md` → `docs/index.html`
- `content/about.md` → `docs/about.html`
- `content/classes/beginner.md` → `docs/classes/beginner.html`

You can override the slug in front matter if needed:

```markdown
---
title: About Us
slug: about
---
```

If the slug contains a path (e.g., `slug: shop/aerial-silks`), it will be used directly for the output path. That path replaces the source directory, language directory included: `fr/silks.md` with `slug: shop/aerial-silks` also writes `shop/aerial-silks.html`, so it collides with the English page and fails the build. Empty path segments are dropped (`a//b` becomes `a/b`).

Front-matter slugs and heading anchors fold accented letters to plain ASCII (`slug: leçons particulières` → `lecons-particulieres`, `## Les leçons` → `#les-lecons`). The ligatures æ, œ, ß and the letters ø, đ, ł fold to `ae`, `oe`, `ss`, `o`, `d`, `l`.

Two pages whose slugs fold to the same name (e.g. `résumé.md` and `resume.md`) fail the build instead of overwriting each other.

**Upgrading from 1.x:** accented slugs and anchors change (`le-ons` becomes `lecons`). Add redirects for renamed pages, and update hand-written `#anchor` links. Translated files store the old slug in `translationOf`, which no longer matches its source. Either run `ensureTranslations(config, contentDir, true)` once to regenerate them, or edit `translationOf` in each translated file to the new slug.

### Breaking Changes in v3.0

**Language switcher markup**: `{{LANGUAGE_SWITCHER}}` no longer emits Tailwind utilities or the `brand`/`slate` colours, and is now a `<nav>` landmark.

Before:

```html
<div class="mb-6 flex flex-wrap items-center gap-2" aria-label="Language selector"><span class="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">EN</span><span class="text-slate-400">·</span><a href="/fr/about" class="inline-flex items-center rounded-full border border-brand/30 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/10">FR</a></div>
```

After:

```html
<nav class="smb-lang-switch" aria-label="Language"><span class="smb-lang-switch__item is-active" aria-current="page">EN</span><a href="/fr/about" hreflang="fr" class="smb-lang-switch__item">FR</a></nav>
```

**Migration**: style `.smb-lang-switch`, `.smb-lang-switch__item` and `.smb-lang-switch__item.is-active` in your own CSS, and update anything that matched the old `aria-label="Language selector"`. The `·` separator is gone; add one with CSS if you want it.

**Language homepages**: with `homepageTemplatePath` set, `fr/index.html` and other language indexes now use the homepage template instead of the normal one.

**Also new** (not breaking): the `onPageRendered` and `onPagesWritten` hooks, the `sanitizeSlug`, `foldAccents` and `slugifyAnchor` exports, the `PageRenderContext` and `KnownPageMeta` types, and custom front-matter keys typed on `PageMeta`.

## Deploying to GitHub Pages

This repo ships a reusable workflow that installs dependencies, runs your tests, builds the site and deploys it to GitHub Pages. A site's whole deploy workflow is the caller below. The site must depend on `simple-markdown-builder` `^3.1.0` so the workflow's `bun run smb` finds the local bin. The repo is public, so callers need no Actions access setting.

Triggers, `permissions` and `concurrency` are not inherited by a called workflow, so they stay in the caller. Reference the workflow by a release tag (`v3.1.0` is the first release with the CLI and this workflow), not `@main`, so a change here can't break a site's deploy until it bumps the tag.

```yaml
# .github/workflows/pages.yml
name: Build and Deploy Pages

on:
  push:
    branches:
      - main
    paths:
      - 'content/**'
      - 'docs/**'
      - 'scripts/**'
      - 'smb.config.ts'
      - 'package.json'
      - 'bun.lock'
      - '.github/workflows/pages.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  pages:
    uses: Pezmc/simple-markdown-builder/.github/workflows/pages.yml@v3.1.0
```

That caller runs `bun run smb build` and uploads `docs`. The build job runs with `contents: read` only; just the deploy job gets `pages: write` and `id-token: write`. A site with tests passes them as inputs, for example:

```yaml
jobs:
  pages:
    uses: Pezmc/simple-markdown-builder/.github/workflows/pages.yml@v3.1.0
    with:
      test-command: bun test scripts/
      test-after-build: true
```

Inputs, all optional:

- `build-command` - Builds the site (default: `bun run smb build`, which runs the locally installed bin and fails if it is missing rather than fetching a package from npm)
- `test-command` - Runs before the build; skipped when empty (default: empty)
- `test-after-build` - Re-run `test-command` against the built site (default: `false`)
- `output-dir` - Directory uploaded to Pages; match the config's `outputDir` (default: `docs`)
- `fetch-depth` - Checkout depth (default: `0`, full history, which git-based `lastmod` dates need)
- `bun-version` - Bun version to install (default: `latest`)

The lockfile in the paths filter is `bun.lock`, Bun's text lockfile; older sites may still list the binary `bun.lockb`, which no longer exists and so never triggers a deploy.
