import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { JsonLd, PageMeta, iAlternateLink } from './config.js'
import { normalizeIndexUrl, stripHtmlExtension, logWarning, logError } from './utils.js'

const DEFAULT_LANG = 'en'

let templateCache: Map<string, string> = new Map()
let homepageTemplateCache: Map<string, string> = new Map()

export function clearTemplateCache(): void {
  templateCache.clear()
  homepageTemplateCache.clear()
}

export async function loadTemplate(templatePath: string): Promise<string> {
  const resolved = path.resolve(templatePath)
  const cached = templateCache.get(resolved)
  if (cached) {
    return cached
  }
  const content = await readFile(resolved, 'utf-8')
  templateCache.set(resolved, content)
  return content
}

export async function loadHomepageTemplate(
  homepageTemplatePath: string | undefined,
  fallbackTemplatePath: string,
): Promise<string> {
  if (!homepageTemplatePath) {
    return loadTemplate(fallbackTemplatePath)
  }
  const resolved = path.resolve(homepageTemplatePath)
  const cached = homepageTemplateCache.get(resolved)
  if (cached) {
    return cached
  }
  const content = await readFile(resolved, 'utf-8')
  homepageTemplateCache.set(resolved, content)
  return content
}

export function escapeHtml(text: string | undefined): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function toAbsoluteUrl(relativePath: string, baseUrl: string): string {
  const normalized = `/${relativePath.replace(/^\/+/, '')}`
  return new URL(normalized, baseUrl).toString()
}

export function cleanUrl(relativePath: string, baseUrl: string): string {
  return toAbsoluteUrl(normalizeIndexUrl(stripHtmlExtension(relativePath)), baseUrl)
}

const REQUIRED_PLACEHOLDERS = ['{{TITLE}}', '{{BODY}}']

function validateTemplatePlaceholders(template: string, templatePath: string): void {
  const missing = REQUIRED_PLACEHOLDERS.filter((placeholder) => !template.includes(placeholder))
  if (missing.length > 0) {
    logWarning(
      `Template ${templatePath} is missing required placeholders: ${missing.join(', ')}`,
    )
  }
}

// Open Graph wants language_TERRITORY; a bare language takes its likely
// region from CLDR (en -> en_US, fr -> fr_FR, pt-br -> pt_BR).
function toOgLocale(lang: string): string {
  const locale = new Intl.Locale(lang).maximize()
  return locale.region ? `${locale.language}_${locale.region}` : locale.language
}

function generateHeadTags(
  meta: PageMeta,
  baseUrl: string,
  canonicalUrl: string | undefined,
  pageUrl: string,
  alternates?: iAlternateLink[],
): string {
  const tags: string[] = []
  const lang = meta.lang ?? DEFAULT_LANG

  // Meta description
  tags.push(`    <meta name="description" content="${escapeHtml(meta.description)}" />`)

  // Canonical URL
  if (canonicalUrl) {
    tags.push(`    <link rel="canonical" href="${canonicalUrl}" />`)
  }

  // Open Graph tags
  tags.push(`    <meta property="og:type" content="${escapeHtml(meta.ogType || 'website')}" />`)
  tags.push(`    <meta property="og:url" content="${pageUrl}" />`)
  tags.push(`    <meta property="og:title" content="${escapeHtml(meta.title)}" />`)
  tags.push(`    <meta property="og:description" content="${escapeHtml(meta.description)}" />`)
  tags.push(`    <meta property="og:locale" content="${escapeHtml(toOgLocale(lang))}" />`)
  const altLocales = new Set(
    (alternates ?? [])
      .filter((alt) => alt.lang !== 'x-default' && alt.lang !== lang)
      .map((alt) => toOgLocale(alt.lang)),
  )
  for (const altLocale of altLocales) {
    tags.push(`    <meta property="og:locale:alternate" content="${escapeHtml(altLocale)}" />`)
  }

  // ogImage handling with warning
  if (meta.ogImage) {
    const ogImageUrl = toAbsoluteUrl(meta.ogImage, baseUrl)
    tags.push(`    <meta property="og:image" content="${ogImageUrl}" />`)
    // Open Graph reads structured properties as belonging to the og:image before them.
    if (meta.ogImageWidth) {
      tags.push(`    <meta property="og:image:width" content="${escapeHtml(String(meta.ogImageWidth))}" />`)
    }
    if (meta.ogImageHeight) {
      tags.push(`    <meta property="og:image:height" content="${escapeHtml(String(meta.ogImageHeight))}" />`)
    }
  } else {
    logWarning(
      `Missing ogImage for page "${meta.output}". ` +
      `Set ogImage in defaultMeta or page front-matter to include Open Graph image tags.`,
    )
  }

  // Twitter Card tags
  tags.push(`    <meta name="twitter:card" content="summary_large_image" />`)
  tags.push(`    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />`)
  tags.push(`    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />`)

  if (meta.twitterImage) {
    const twitterImageUrl = toAbsoluteUrl(meta.twitterImage, baseUrl)
    tags.push(`    <meta name="twitter:image" content="${twitterImageUrl}" />`)
  }

  // Hreflang links
  for (const alt of alternates ?? []) {
    tags.push(`    <link rel="alternate" href="${alt.href}" hreflang="${alt.lang}" />`)
  }

  // Noindex tag
  if (meta.noindex) {
    tags.push(`    <meta name="robots" content="noindex, nofollow" />`)
  }

  return tags.join('\n')
}

// `<` is escaped so no string in the data can close the script element early.
export function renderJsonLd(data: JsonLd): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `    <script type="application/ld+json">${json}</script>`
}

export function formatUpdated(isoDate: string | undefined, lang: string): string {
  if (!isoDate) return ''
  // A calendar day: formatted in UTC so it cannot shift a day either way.
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`))
}

export interface RenderOptions {
  readonly jsonLd?: JsonLd
  // A 404 page is served at every missing URL, so it has no canonical URL.
  readonly notFound?: boolean
}

export async function renderTemplate(
  body: string,
  meta: PageMeta,
  templatePath: string,
  baseUrl: string,
  isHomepage: boolean = false,
  homepageTemplatePath?: string,
  alternates?: iAlternateLink[],
  canonicalRelative?: string,
  options: RenderOptions = {},
): Promise<string> {
  const template = isHomepage && homepageTemplatePath
    ? await loadHomepageTemplate(homepageTemplatePath, templatePath)
    : await loadTemplate(templatePath)
  
  validateTemplatePlaceholders(template, templatePath)

  const outputPath = meta.output
  const canonicalUrl = options.notFound
    ? undefined
    : canonicalRelative
      ? toAbsoluteUrl(normalizeIndexUrl(stripHtmlExtension(canonicalRelative)), baseUrl)
      : cleanUrl(outputPath, baseUrl)
  const pageUrl = cleanUrl(outputPath, baseUrl)

  const languageSwitcher = alternates
    ? renderLanguageSwitcher(meta.lang ?? DEFAULT_LANG, alternates)
    : ''

  let rendered = template
    .replace(/\{\{TITLE\}\}/g, escapeHtml(meta.title))
    .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(meta.description))
    .replace(/\{\{LANGUAGE_SWITCHER\}\}/g, languageSwitcher)
    .replace(/\{\{LANG\}\}/g, meta.lang ?? DEFAULT_LANG)
    .replace(/\{\{BACK_LINK_HREF\}\}/g, escapeHtml(meta.backLinkHref))
    .replace(/\{\{BACK_LINK_LABEL\}\}/g, escapeHtml(meta.backLinkLabel))
    .replace(/\{\{SIDEBAR_TITLE\}\}/g, escapeHtml(meta.sidebarTitle))
    .replace(/\{\{SIDEBAR_SUMMARY\}\}/g, escapeHtml(meta.sidebarSummary))
    .replace(/\{\{YEAR\}\}/g, new Date().getFullYear().toString())
    .replace(/\{\{UPDATED\}\}/g, () => escapeHtml(formatUpdated(meta.lastModified, meta.lang ?? DEFAULT_LANG)))
    .replace(/\{\{UPDATED_ISO\}\}/g, meta.lastModified ?? '')
    .replace(/\{\{BODY\}\}/g, body)

  // Automatically inject all head tags before </head>
  const headEndMatch = rendered.match(/<\/head>/i)
  if (!headEndMatch) {
    logError(`Template ${templatePath} is missing </head> tag. Cannot inject meta tags.`)
    throw new Error(`Template ${templatePath} is missing </head> tag`)
  }

  const headTags = [
    generateHeadTags(meta, baseUrl, canonicalUrl, pageUrl, alternates),
    ...(options.jsonLd ? [renderJsonLd(options.jsonLd)] : []),
  ].join('\n')
  const insertPosition = headEndMatch.index!
  rendered =
    rendered.slice(0, insertPosition) +
    `${headTags}\n` +
    rendered.slice(insertPosition)

  return rendered
}

function renderLanguageSwitcher(
  currentLang: string,
  alternates: iAlternateLink[],
): string {
  const available = alternates.filter((alt) => alt.lang !== 'x-default')
  if (available.length <= 1) {
    return ''
  }

  const items = available
    .map((alt) => {
      const label = alt.lang.toUpperCase()
      if (alt.lang === currentLang) {
        return `<span class="smb-lang-switch__item is-active" aria-current="page">${label}</span>`
      }
      const href = new URL(alt.href).pathname
      return `<a href="${href}" hreflang="${alt.lang}" class="smb-lang-switch__item">${label}</a>`
    })
    .join('')

  return `<nav class="smb-lang-switch" aria-label="Language">${items}</nav>`
}

