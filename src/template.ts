import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { JsonLd, PageMeta, iAlternateLink } from './config.js'
import { normalizeIndexUrl, stripHtmlExtension, logWarning, logError } from './utils.js'

const DEFAULT_LANG = 'en'

// Expanded templates, keyed by resolved path. Promises, so pages rendering
// concurrently share one read.
const templateCache: Map<string, Promise<string>> = new Map()
const templateFiles: Set<string> = new Set()

export function clearTemplateCache(): void {
  templateCache.clear()
  templateFiles.clear()
}

// Every template and partial file read (or attempted) since the cache was
// last cleared, so the dev server can rebuild when one changes.
export function getTemplateFiles(): readonly string[] {
  return [...templateFiles]
}

export function loadTemplate(templatePath: string): Promise<string> {
  const resolved = path.resolve(templatePath)
  let cached = templateCache.get(resolved)
  if (!cached) {
    cached = expandIncludes(resolved, []).then((template) => {
      validateSections(template, templatePath)
      return template
    })
    templateCache.set(resolved, cached)
  }
  return cached
}

const INCLUDE = /\{\{>\s*(\S+?)\s*\}\}/g

async function expandIncludes(filePath: string, chain: readonly string[]): Promise<string> {
  const here = [...chain, filePath]
  const describe = (): string => here.map((file) => path.relative(process.cwd(), file)).join(' -> ')
  if (chain.includes(filePath)) {
    throw new Error(`Template include cycle: ${describe()}`)
  }
  templateFiles.add(filePath)
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch (error) {
    if (chain.length > 0 && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Template include not found: ${describe()}`)
    }
    throw error
  }
  const includes = [...content.matchAll(INCLUDE)]
  const expanded = await Promise.all(
    includes.map((match) => expandIncludes(path.resolve(path.dirname(filePath), match[1]!), here)),
  )
  let index = 0
  return content.replace(INCLUDE, () => expanded[index++]!)
}

const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g
const SECTION_TAG = /\{\{([#/])([A-Z][A-Z0-9_]*)\}\}/g

export const BUILT_IN_PLACEHOLDERS: ReadonlySet<string> = new Set([
  'TITLE',
  'DESCRIPTION',
  'LANGUAGE_SWITCHER',
  'LANG',
  'BACK_LINK_HREF',
  'BACK_LINK_LABEL',
  'SIDEBAR_TITLE',
  'SIDEBAR_SUMMARY',
  'YEAR',
  'UPDATED',
  'UPDATED_ISO',
  'BODY',
])

// heroImage -> HERO_IMAGE. Keys that do not make a valid name return undefined.
export function toPlaceholderName(key: string): string | undefined {
  const name = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toUpperCase()
  return /^[A-Z][A-Z0-9_]*$/.test(name) ? name : undefined
}

// Names a template refers to through placeholders or sections.
export function templatePlaceholderNames(template: string): Set<string> {
  const names = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER)) names.add(match[1]!)
  for (const match of template.matchAll(SECTION_TAG)) names.add(match[2]!)
  return names
}

function validateSections(template: string, templatePath: string): void {
  const stack: string[] = []
  for (const [, kind, name] of template.matchAll(SECTION_TAG)) {
    if (kind === '#') {
      stack.push(name!)
      continue
    }
    const open = stack.pop()
    if (open === undefined) {
      throw new Error(`Template ${templatePath} closes section ${name} that was never opened`)
    }
    if (open !== name) {
      throw new Error(`Template ${templatePath} closes section ${name} while section ${open} is open`)
    }
  }
  if (stack.length > 0) {
    throw new Error(`Template ${templatePath} never closes section ${stack[stack.length - 1]}`)
  }
}

// Structure was checked at load, so tags here are balanced.
function renderSections(template: string, values: ReadonlyMap<string, string>): string {
  const keep: boolean[] = []
  let output = ''
  let last = 0
  for (const match of template.matchAll(SECTION_TAG)) {
    if (keep.every(Boolean)) output += template.slice(last, match.index)
    last = match.index + match[0].length
    if (match[1] === '#') {
      keep.push(Boolean(values.get(match[2]!)))
    } else {
      keep.pop()
    }
  }
  return output + template.slice(last)
}

function metaPlaceholderValues(meta: PageMeta): Map<string, string> {
  const values = new Map<string, string>()
  for (const [key, value] of Object.entries(meta)) {
    const name = toPlaceholderName(key)
    if (!name || value === undefined) continue
    values.set(name, typeof value === 'boolean' ? (value ? 'true' : '') : escapeHtml(value))
  }
  return values
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
  const template = await loadTemplate(
    isHomepage && homepageTemplatePath ? homepageTemplatePath : templatePath,
  )
  
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

  const lang = meta.lang ?? DEFAULT_LANG
  const values = metaPlaceholderValues(meta)
  // Built-ins win over front-matter keys of the same name.
  const builtIns: Record<string, string> = {
    TITLE: escapeHtml(meta.title),
    DESCRIPTION: escapeHtml(meta.description),
    LANGUAGE_SWITCHER: languageSwitcher,
    LANG: lang,
    BACK_LINK_HREF: escapeHtml(meta.backLinkHref),
    BACK_LINK_LABEL: escapeHtml(meta.backLinkLabel),
    SIDEBAR_TITLE: escapeHtml(meta.sidebarTitle),
    SIDEBAR_SUMMARY: escapeHtml(meta.sidebarSummary),
    YEAR: new Date().getFullYear().toString(),
    UPDATED: escapeHtml(formatUpdated(meta.lastModified, lang)),
    UPDATED_ISO: meta.lastModified ?? '',
    BODY: body,
  }
  for (const [name, value] of Object.entries(builtIns)) values.set(name, value)

  // One pass, so neither the body nor any inserted value is expanded again.
  let rendered = renderSections(template, values).replace(
    PLACEHOLDER,
    (_, name: string) => values.get(name) ?? '',
  )

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

