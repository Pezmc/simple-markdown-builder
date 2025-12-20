import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PageMeta, iAlternateLink } from './config.js'

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

export function escapeHtml(text: string): string {
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
  const defaultLang = 'en'
  const template = isHomepage && homepageTemplatePath
    ? await loadHomepageTemplate(homepageTemplatePath, templatePath)
    : await loadTemplate(templatePath)

  const outputPath = meta.output ?? 'index.html'
  const canonicalUrl = canonicalRelative
    ? toAbsoluteUrl(stripHtmlExtension(canonicalRelative), baseUrl)
    : cleanUrl(outputPath, baseUrl)
  const pageUrl = cleanUrl(outputPath, baseUrl)
  const ogImage = meta.ogImage
    ? toAbsoluteUrl(meta.ogImage, baseUrl)
    : toAbsoluteUrl('img/default-og.png', baseUrl)

  const hreflangLinks = alternates
    ? alternates
        .filter((alt) => alt.lang !== 'x-default')
        .map(
          (alt) =>
            `    <link rel="alternate" href="${alt.href}" hreflang="${alt.lang}" />`,
        )
        .join('\n')
    : ''

  const noindexTag = meta.noindex
    ? '    <meta name="robots" content="noindex, nofollow" />'
    : ''

  const languageSwitcher = alternates
    ? renderLanguageSwitcher(meta.lang ?? defaultLang, alternates)
    : ''

  return template
    .replace(/\{\{TITLE\}\}/g, escapeHtml(meta.title))
    .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(meta.description))
    .replace(/\{\{CANONICAL_URL\}\}/g, canonicalUrl)
    .replace(/\{\{OG_URL\}\}/g, pageUrl)
    .replace(/\{\{OG_TITLE\}\}/g, escapeHtml(meta.title))
    .replace(/\{\{OG_DESCRIPTION\}\}/g, escapeHtml(meta.description))
    .replace(/\{\{OG_IMAGE\}\}/g, ogImage)
    .replace(/\{\{TWITTER_TITLE\}\}/g, escapeHtml(meta.title))
    .replace(/\{\{TWITTER_DESCRIPTION\}\}/g, escapeHtml(meta.description))
    .replace(/\{\{TWITTER_IMAGE\}\}/g, ogImage)
    .replace(/\{\{HREFLANG_LINKS\}\}/g, hreflangLinks)
    .replace(/\{\{NOINDEX\}\}/g, noindexTag)
    .replace(/\{\{LANGUAGE_SWITCHER\}\}/g, languageSwitcher)
    .replace(/\{\{LANG\}\}/g, meta.lang ?? defaultLang)
    .replace(/\{\{BACK_LINK_HREF\}\}/g, escapeHtml(meta.backLinkHref))
    .replace(/\{\{BACK_LINK_LABEL\}\}/g, escapeHtml(meta.backLinkLabel))
    .replace(/\{\{SIDEBAR_TITLE\}\}/g, escapeHtml(meta.sidebarTitle))
    .replace(/\{\{SIDEBAR_SUMMARY\}\}/g, escapeHtml(meta.sidebarSummary))
    .replace(/\{\{YEAR\}\}/g, new Date().getFullYear().toString())
    .replace(/\{\{BODY\}\}/g, body)
}

function stripHtmlExtension(url: string): string {
  return url.replace(/\.html?$/i, '')
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

