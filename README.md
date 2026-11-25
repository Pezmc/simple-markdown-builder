# simple-markdown-builder

![xkcd 927: Standards](https://imgs.xkcd.com/comics/standards.png)

*Yet another markdown site generator* (because [Jekyll](https://jekyllrb.com/), [Hugo](https://gohugo.io/), [11ty](https://www.11ty.dev/), [Astro](https://astro.build/), [Next.js](https://nextjs.org/), [Gatsby](https://www.gatsbyjs.com/), [VitePress](https://vitepress.dev/), [Docusaurus](https://docusaurus.io/), [MkDocs](https://www.mkdocs.org/), [MkDocs Material](https://squidfunk.github.io/mkdocs-material/), [GitBook](https://www.gitbook.com/), [Docus](https://docus.dev/), [VuePress](https://vuepress.vuejs.org/), and [Nuxt Content](https://content.nuxtjs.org/) weren't enough)

A simple markdown-to-HTML site builder with optional translations.

## Installation

```bash
bun add simple-markdown-builder
```

## Usage

### Basic Setup

```typescript
import { build } from 'simple-markdown-builder'

await build({
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
- `clean` - Clean HTML files from output directory before building (default: `false`)
- `onPageRendered` - Optional hook to rewrite each page's HTML before it is written (see below)
- `onPagesWritten` - Optional hook that runs once every page is written, before the link check (see below)

### Build Hooks

`onPageRendered(html, plan, { plans, groups })` receives each page's rendered HTML and returns the HTML to write. `plans` is every page in the build and `groups` maps each translation group key (`translationOf`, else `slug`) to its pages, so the hook can add cross-page navigation. Pages render concurrently, so the hook must not depend on the order it is called in.

`onPagesWritten(plans, outputDir)` runs after every page is written and before the link check, even when `skipLinkCheck` is set. Write extra files here, such as redirect stubs that the rewritten pages link to. Files written here are link-checked but stay out of the sitemap, which is built from `plans`.

Both hooks may be async. `startDevServer` calls `build()`, so watch mode runs them on every rebuild.

```typescript
await build({
  ...config,
  onPageRendered: (html, plan, { groups }) => html.replace('</main>', `${renderNav(plan, groups)}</main>`),
  onPagesWritten: async (plans, outputDir) => {
    await writeFile(path.join(outputDir, 'fr', 'house-rules.html'), redirectTo('/house-rules'))
  },
})
```

Custom front-matter keys pass through onto `plan.meta` (`eyebrow: Welcome` is `plan.meta.eyebrow`). Their values are strings.

The builder's own slug helpers are exported, so a hook can map outputs back to sources with the same rules: `sanitizeSlug`, `foldAccents` and `slugifyAnchor` (the heading-anchor slugifier).

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
