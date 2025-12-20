import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PageMeta } from './config.js'

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
): Promise<string> {
  const template = isHomepage && homepageTemplatePath
    ? await loadHomepageTemplate(homepageTemplatePath, templatePath)
    : await loadTemplate(templatePath)

  const outputPath = meta.output ?? 'index.html'
  const pageUrl = cleanUrl(outputPath, baseUrl)
  const canonicalUrl = pageUrl
  const ogImage = meta.ogImage
    ? toAbsoluteUrl(meta.ogImage, baseUrl)
    : toAbsoluteUrl('img/default-og.png', baseUrl)

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
    .replace(/\{\{BODY\}\}/g, body)
}

