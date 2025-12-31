import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PageMeta, iAlternateLink } from './config.js'
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
  let cleaned = relativePath.replace(/\.html$/, '')
  if (cleaned === 'index') {
    cleaned = ''
  }
  const normalized = cleaned ? `/${cleaned}` : '/'
  return new URL(normalized, baseUrl).toString()
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

function generateHeadTags(
  meta: PageMeta,
  baseUrl: string,
  canonicalUrl: string,
  pageUrl: string,
  alternates?: iAlternateLink[],
): string {
  const tags: string[] = []

  // Meta description
  tags.push(`    <meta name="description" content="${escapeHtml(meta.description)}" />`)

  // Canonical URL
  tags.push(`    <link rel="canonical" href="${canonicalUrl}" />`)

  // Open Graph tags
  tags.push(`    <meta property="og:url" content="${pageUrl}" />`)
  tags.push(`    <meta property="og:title" content="${escapeHtml(meta.title)}" />`)
  tags.push(`    <meta property="og:description" content="${escapeHtml(meta.description)}" />`)

  // ogImage handling with warning
  if (meta.ogImage) {
    const ogImageUrl = toAbsoluteUrl(meta.ogImage, baseUrl)
    tags.push(`    <meta property="og:image" content="${ogImageUrl}" />`)
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
  if (alternates) {
    const hreflangLinks = alternates
      .filter((alt) => alt.lang !== 'x-default')
      .map(
        (alt) =>
          `    <link rel="alternate" href="${alt.href}" hreflang="${alt.lang}" />`,
      )
    if (hreflangLinks.length > 0) {
      tags.push(...hreflangLinks)
    }
  }

  // Noindex tag
  if (meta.noindex) {
    tags.push(`    <meta name="robots" content="noindex, nofollow" />`)
  }

  return tags.join('\n')
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
): Promise<string> {
  const template = isHomepage && homepageTemplatePath
    ? await loadHomepageTemplate(homepageTemplatePath, templatePath)
    : await loadTemplate(templatePath)
  
  validateTemplatePlaceholders(template, templatePath)

  const outputPath = meta.output
  const canonicalUrl = canonicalRelative
    ? toAbsoluteUrl(normalizeIndexUrl(stripHtmlExtension(canonicalRelative)), baseUrl)
    : cleanUrl(outputPath, baseUrl)
  const pageUrl = cleanUrl(outputPath, baseUrl)

  const languageSwitcher = alternates
    ? renderLanguageSwitcher(meta.lang ?? DEFAULT_LANG, alternates)
    : ''

  let rendered = template
    .replace(/\{\{TITLE\}\}/g, escapeHtml(meta.title))
    .replace(/\{\{LANGUAGE_SWITCHER\}\}/g, languageSwitcher)
    .replace(/\{\{LANG\}\}/g, meta.lang ?? DEFAULT_LANG)
    .replace(/\{\{BACK_LINK_HREF\}\}/g, escapeHtml(meta.backLinkHref))
    .replace(/\{\{BACK_LINK_LABEL\}\}/g, escapeHtml(meta.backLinkLabel))
    .replace(/\{\{SIDEBAR_TITLE\}\}/g, escapeHtml(meta.sidebarTitle))
    .replace(/\{\{SIDEBAR_SUMMARY\}\}/g, escapeHtml(meta.sidebarSummary))
    .replace(/\{\{YEAR\}\}/g, new Date().getFullYear().toString())
    .replace(/\{\{BODY\}\}/g, body)

  // Automatically inject all head tags before </head>
  const headEndMatch = rendered.match(/<\/head>/i)
  if (!headEndMatch) {
    logError(`Template ${templatePath} is missing </head> tag. Cannot inject meta tags.`)
    throw new Error(`Template ${templatePath} is missing </head> tag`)
  }

  const headTags = generateHeadTags(meta, baseUrl, canonicalUrl, pageUrl, alternates)
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

  const pills = available
    .map((alt) => {
      const isActive = alt.lang === currentLang
      const label = alt.lang.toUpperCase()
      const href = new URL(alt.href).pathname
      if (isActive) {
        return `<span class="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">${label}</span>`
      }
      return `<a href="${href}" class="inline-flex items-center rounded-full border border-brand/30 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/10">${label}</a>`
    })
    .join('<span class="text-slate-400">·</span>')

  return `<div class="mb-6 flex flex-wrap items-center gap-2" aria-label="Language selector">${pills}</div>`
}

