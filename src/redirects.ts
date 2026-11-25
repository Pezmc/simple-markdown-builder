import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BuilderConfig, RedirectInfo, RenderPlan } from './config.js'
import { groupByTranslation } from './sitemap.js'
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
// "guides/index.html".
function normalizeFrom(from: string): string {
  if (ABSOLUTE_URL.test(from) || from.startsWith('//') || /[?#]/.test(from)) {
    throw new Error(`Redirect from "${from}" must be a site path without a query or fragment`)
  }
  const trimmed = from.replace(/^\/+/, '')
  if (trimmed.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`Redirect from "${from}" must not contain . or .. segments`)
  }
  const withIndex = trimmed === '' || trimmed.endsWith('/') ? `${trimmed}index` : trimmed
  return `${stripHtmlExtension(withIndex)}.html`
}

// The built page an internal `to` lands on, tried the way a static host
// resolves it: as is, with .html, and as a directory index.
function resolveTarget(to: string, pages: ReadonlyMap<string, RenderPlan>): RenderPlan | undefined {
  const pathname = (to.split(/[?#]/)[0] ?? '').replace(/^\/+/, '')
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
  const stubs = new Map<string, RedirectStub>()

  const add = (relativeOutput: string, to: string, canonical: string, lang: string, reason: RedirectInfo['reason']): void => {
    const from = sitePath(relativeOutput)
    const page = pages.get(relativeOutput)
    if (page) {
      throw new Error(
        `Redirect from ${from} collides with the page ${relativeOutput} built from ${path.relative(process.cwd(), page.sourcePath)}`,
      )
    }
    const existing = stubs.get(relativeOutput)
    if (existing) {
      throw new Error(
        `Redirect from ${from} is declared twice (to ${existing.info.to} and to ${to})`,
      )
    }
    stubs.set(relativeOutput, {
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

    if (/^https?:\/\//i.test(to)) {
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
    for (const group of groupByTranslation([...plans]).values()) {
      const defaults = group.filter((entry) => entry.meta.lang === defaultLang)
      for (const plan of defaults) {
        for (const lang of supportedLangs) {
          const inLang = group.filter((entry) => entry.meta.lang === lang)
          // A slug-keyed group can hold several default-language pages
          // (index.md and guides/index.md). Then only a page at the mirrored
          // path shows which of them is translated.
          const translated = defaults.length === 1
            ? inLang.length > 0
            : inLang.some((entry) => entry.relativeOutput === `${lang}/${plan.relativeOutput}`)
          if (translated) {
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
        ? config.renderRedirect(stub.info)
        : renderRedirectStub(stub.info, stub.canonical)
      await mkdir(path.dirname(stub.outputPath), { recursive: true })
      await writeFile(stub.outputPath, html)
      console.log(`Generated redirect ${stub.info.from} -> ${stub.info.to}`)
    }),
  )
}
