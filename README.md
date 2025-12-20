# simple-markdown-builder

![xkcd 927: Standards](https://imgs.xkcd.com/comics/standards.png)

*Yet another markdown site generator* (because [Jekyll](https://jekyllrb.com/), [Hugo](https://gohugo.io/), [11ty](https://www.11ty.dev/), [Astro](https://astro.build/), [Next.js](https://nextjs.org/), [Gatsby](https://www.gatsbyjs.com/), [VitePress](https://vitepress.dev/), [Docusaurus](https://docusaurus.io/), [MkDocs](https://www.mkdocs.org/), [MkDocs Material](https://squidfunk.github.io/mkdocs-material/), [GitBook](https://www.gitbook.com/), [Docus](https://docus.dev/), [VuePress](https://vuepress.vuejs.org/), and [Nuxt Content](https://content.nuxtjs.org/) weren't quite right for this use case)

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
  baseUrl: 'https://example.com',
  templatePath: 'scripts/template.html',
  defaultMeta: {
    title: 'My Site',
    description: 'A simple site',
    sidebarTitle: 'My Site',
    sidebarSummary: 'Welcome to my site',
    backLinkHref: '/',
    backLinkLabel: 'Back to home',
  },
})
```

### With Translations

```typescript
import { build, ensureTranslations } from 'simple-markdown-builder'

const config = {
  baseUrl: 'https://example.com',
  templatePath: 'scripts/template.html',
  defaultMeta: { /* ... */ },
  translations: {
    apiKey: process.env.DEEPL_API_KEY,
    targetLanguages: ['fr', 'nl'],
    defaultLang: 'en',
    supportedLangs: ['en', 'fr', 'nl'],
    customGlossary: {
      fr: {
        'rope jam': 'rope jam',
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
- `skipLinkCheck` - Whether to skip link validation

### Template Placeholders

Templates support these placeholders:
- `{{TITLE}}` - Page title
- `{{DESCRIPTION}}` - Page description
- `{{BODY}}` - Rendered HTML body
- `{{CANONICAL_URL}}` - Canonical URL
- `{{OG_URL}}` - Open Graph URL
- `{{OG_TITLE}}` - Open Graph title
- `{{OG_DESCRIPTION}}` - Open Graph description
- `{{OG_IMAGE}}` - Open Graph image
- `{{TWITTER_TITLE}}` - Twitter card title
- `{{TWITTER_DESCRIPTION}}` - Twitter card description
- `{{TWITTER_IMAGE}}` - Twitter card image

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

These are automatically appended to external links.

