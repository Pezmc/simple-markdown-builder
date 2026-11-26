import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BuilderConfig, RedirectInfo, RenderPlan } from './config.js'
import { groupByTranslation } from './sitemap.js'
import { isNotFoundOutput } from './seo.js'
import { cleanUrl, escapeHtml } from './template.js'
import { normalizeIndexUrl, stripHtmlExtension } from './utils.js'

export interface RedirectStub {
  readonly outputPath: string
  readonly canonical: string
  readonly info: RedirectInfo
}

const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:/i

function sitePath(relativeOutput: string): string {
  return `/${normalizeIndexUrl(stripHtmlExtension(relativeOutput))}`
}

// "/old", "old.html" and "/guides/" become "old.html", "old.html" and
// "guides/index.html". Repeated slashes collapse, as path.join would collapse
// them when the stub is written.
function normalizeFrom(from: string): string {
  if (ABSOLUTE_URL.test(from) || from.startsWith('//') || /[?#]/.test(from)) {
    throw new Error(`Redirect from "${from}" must be a site path without a query or fragment`)
  }
  // path.join treats "\\" as a separator on Windows, so it could smuggle in ".."
  if (from.includes('\\')) {
    throw new Error(`Redirect from "${from}" must not contain backslashes`)
  }
  const trimmed = from.replace(/\/+/g, '/').replace(/^\//, '')
  // Hosts decode the request path before looking up a file, so the stub is
  // written under the decoded name ("le%C3%A7ons" -> "leçons.html"), and an
  // encoded "%2e%2e" is caught as the ".." it becomes.
  const segments = trimmed.split('/').map((segment) => {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      throw new Error(`Redirect from "${from}" has a malformed percent escape`)
    }
    if (/[/\\]/.test(decoded)) {
      throw new Error(`Redirect from "${from}" must not encode a slash or backslash`)
    }
    return decoded
  })
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`Redirect from "${from}" must not contain . or .. segments`)
  }
  const decodedPath = segments.join('/')
  const withIndex = decodedPath === '' || decodedPath.endsWith('/') ? `${decodedPath}index` : decodedPath
  // Only .html stubs are served for their extensionless URL; "/old.htm" would
  // be written to old.html and still 404.
  const extension = path.posix.extname(withIndex)
  // ".HTML" is refused too: the stub is written as lower-case .html, which a
  // case-sensitive host would not serve for "/old.HTML".
  if (extension && extension !== '.html') {
    throw new Error(`Redirect from "${from}" must end in .html or have no extension`)
  }
  return `${withIndex.slice(0, withIndex.length - extension.length)}.html`
}

function isHttpUrl(to: string): boolean {
  if (!/^https?:\/\//i.test(to)) {
    return false
  }
  try {
    return new URL(to).hostname !== ''
  } catch {
    return false
  }
}

// The built page an internal `to` lands on, tried the way a static host
// resolves it: as is, with .html, and as a directory index.
function resolveTarget(to: string, pages: ReadonlyMap<string, RenderPlan>): RenderPlan | undefined {
  // Output paths are decoded file names, so "/team%20docs/about" is looked up
  // as "team docs/about".
  let pathname = (to.split(/[?#]/)[0] ?? '').replace(/^\/+/, '')
  try {
    pathname = decodeURI(pathname)
  } catch {
    // A malformed escape is looked up as written and reported as not built.
  }
  const candidates = pathname === '' || pathname.endsWith('/')
    ? [`${pathname}index.html`]
    : [pathname, `${pathname}.html`, `${pathname}/index.html`]
  return candidates.map((candidate) => pages.get(candidate)).find(Boolean)
}

export function planRedirectStubs(
  config: BuilderConfig,
  plans: readonly RenderPlan[],
  outputDir: string,
  defaultLang: string,
  supportedLangs: readonly string[],
): RedirectStub[] {
  const pages = new Map(plans.map((plan) => [plan.relativeOutput, plan]))
  // Collisions compare case-insensitively: on macOS and Windows "About.html"
  // and "about.html" are one file, and the stub would replace the page.
  const pagesByFoldedPath = new Map(plans.map((plan) => [plan.relativeOutput.toLowerCase(), plan]))
  const stubs = new Map<string, RedirectStub>()

  const add = (relativeOutput: string, to: string, canonical: string, lang: string, reason: RedirectInfo['reason']): void => {
    const from = sitePath(relativeOutput)
    const key = relativeOutput.toLowerCase()
    const page = pagesByFoldedPath.get(key)
    if (page) {
      throw new Error(
        `Redirect from ${from} collides with the page ${page.relativeOutput} built from ${path.relative(process.cwd(), page.sourcePath)}`,
      )
    }
    const existing = stubs.get(key)
    if (existing) {
      throw new Error(
        `Redirect from ${from} is declared twice (to ${existing.info.to} and to ${to})`,
      )
    }
    stubs.set(key, {
      outputPath: path.join(outputDir, ...relativeOutput.split('/')),
      canonical,
      info: { from, to, lang, reason },
    })
  }

  for (const { from, to } of config.redirects ?? []) {
    const relativeOutput = normalizeFrom(from)
    const firstSegment = relativeOutput.split('/')[0] ?? ''
    const lang = relativeOutput.includes('/') && supportedLangs.includes(firstSegment)
      ? firstSegment
      : defaultLang

    if (isHttpUrl(to)) {
      add(relativeOutput, to, to, lang, 'moved')
      continue
    }
    // Protocol-relative and other-scheme targets are refused: the link checker
    // would read "//host" as a local path, and "javascript:" has no place in a link.
    if (!to.startsWith('/') || to.startsWith('//')) {
      throw new Error(`Redirect to "${to}" must be a site path starting with / or an http(s) URL`)
    }
    const target = resolveTarget(to, pages)
    if (!target) {
      throw new Error(`Redirect from ${sitePath(relativeOutput)} points to ${to}, which is not a built page`)
    }
    add(relativeOutput, to, cleanUrl(target.relativeOutput, config.baseUrl), lang, 'moved')
  }

  if (config.translationFallback === 'redirect') {
    // A 404 page answers every missing URL, so it is nobody's translation.
    const translatable = plans.filter((plan) => !isNotFoundOutput(plan.relativeOutput, supportedLangs))
    for (const group of groupByTranslation(translatable).values()) {
      const langs = new Set(group.map((entry) => entry.meta.lang))
      for (const plan of group.filter((entry) => entry.meta.lang === defaultLang)) {
        for (const lang of supportedLangs) {
          if (langs.has(lang)) {
            continue
          }
          add(
            `${lang}/${plan.relativeOutput}`,
            sitePath(plan.relativeOutput),
            cleanUrl(plan.relativeOutput, config.baseUrl),
            lang,
            'untranslated',
          )
        }
      }
    }
  }

  return [...stubs.values()]
}

const MESSAGES: Record<RedirectInfo['reason'], string> = {
  moved: 'This page has moved.',
  untranslated: 'This page is not available in this language.',
}

export function renderRedirectStub(info: RedirectInfo, canonical: string): string {
  const to = escapeHtml(info.to)
  return `<!DOCTYPE html>
<html lang="${escapeHtml(info.lang)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redirecting…</title>
  <meta name="robots" content="noindex, follow" />
  <meta http-equiv="refresh" content="0; url=${to}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
</head>
<body>
  <p>${MESSAGES[info.reason]} <a href="${to}">Continue to ${to}</a></p>
</body>
</html>
`
}

export async function writeRedirectStubs(
  stubs: readonly RedirectStub[],
  config: BuilderConfig,
): Promise<void> {
  await Promise.all(
    stubs.map(async (stub) => {
      const html = config.renderRedirect
        ? await config.renderRedirect(stub.info)
        : renderRedirectStub(stub.info, stub.canonical)
      await mkdir(path.dirname(stub.outputPath), { recursive: true })
      await writeFile(stub.outputPath, html)
      console.log(`Generated redirect ${stub.info.from} -> ${stub.info.to}`)
    }),
  )
}
