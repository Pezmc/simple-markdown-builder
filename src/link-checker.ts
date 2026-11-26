import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { LinkCheckConfig, MissingLink, RenderPlan } from './config.js'
import {
  collectHtmlFiles,
  slugifyAnchor,
  logWarning,
  normalizeIndexUrl,
  stripHtmlExtension,
} from './utils.js'

const SKIP_PREFIXES = ['mailto:', 'tel:', 'javascript:', 'data:']
const SKIP_SCHEMES = ['http://', 'https://']
const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:/i

function isSkippableHref(href: string): boolean {
  return (
    !href ||
    SKIP_PREFIXES.some((prefix) => href.startsWith(prefix)) ||
    SKIP_SCHEMES.some((scheme) => href.startsWith(scheme))
  )
}

function extractAnchor(href: string): string | null {
  const hashIndex = href.indexOf('#')
  if (hashIndex === -1) {
    return null
  }
  return href.slice(hashIndex + 1) || null
}

function extractIdsFromHtml(html: string): Set<string> {
  const ids = new Set<string>()
  // Match id="..." or id='...'
  const idMatches = html.matchAll(/id=["']([^"']+)["']/gi)
  for (const match of idMatches) {
    if (match[1]) {
      // Normalize IDs to match how anchors are normalized when checking
      ids.add(slugifyAnchor(match[1]))
    }
  }
  return ids
}

function resolveInternalPath(href: string, fromFile: string, outputDir: string): string {
  const withoutHash = href.split('#')[0] ?? ''
  const withoutQuery = withoutHash.split('?')[0] ?? ''
  
  if (withoutQuery.startsWith('/')) {
    const relativePath = withoutQuery.slice(1).replace(/\/+/g, '/')
    return path.normalize(path.join(outputDir, ...relativePath.split('/')))
  }
  
  // For relative paths that don't go up (no ../), try resolving from OUTPUT_DIR first
  // This handles cases like img/logo.png which are meant to be from site root
  if (!withoutQuery.startsWith('../') && !path.isAbsolute(withoutQuery)) {
    return path.normalize(path.join(outputDir, withoutQuery))
  }
  
  return path.normalize(path.resolve(path.dirname(fromFile), withoutQuery))
}

async function findTargetFile(
  resolvedPath: string,
): Promise<{ found: boolean; targetFile: string | null }> {
  const normalizedResolved = path.normalize(resolvedPath)
  const pathVariations = [
    normalizedResolved,
    `${normalizedResolved}.html`,
    path.join(normalizedResolved, 'index.html'),
  ]

  for (const variation of pathVariations) {
    try {
      const normalizedVariation = path.normalize(variation)
      const stats = await stat(normalizedVariation)
      const checkPath = stats.isDirectory()
        ? path.join(normalizedVariation, 'index.html')
        : normalizedVariation
      await stat(checkPath)
      return { found: true, targetFile: checkPath }
    } catch {
      // Continue to next variation
    }
  }
  
  return { found: false, targetFile: null }
}

function extractHrefs(html: string): string[] {
  const matches = html.match(/href="([^"]+)"/g) ?? []
  return matches.map((match) => match.slice(6, -1))
}

// A srcset URL may itself contain commas (data: URLs), so candidates are split
// the way browsers do: a URL runs to the next whitespace, and a comma ends a
// candidate only after its URL or descriptors.
function srcsetUrls(srcset: string): string[] {
  const urls: string[] = []
  let expectUrl = true
  for (const token of srcset.trim().split(/\s+/)) {
    const url: string = expectUrl ? token : token.slice(token.indexOf(',') + 1)
    if (!expectUrl && !token.includes(',')) {
      continue
    }
    if (url) {
      urls.push(url.replace(/,+$/, ''))
    }
    expectUrl = !url || url.endsWith(',')
  }
  return urls
}

// The leading whitespace keeps lazy-loading `data-src`/`data-srcset` out: they
// often hold placeholders the page swaps in with script.
function extractAssetUrls(html: string): string[] {
  const urls: string[] = []
  for (const match of html.matchAll(/\s(src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const value = match[2] ?? match[3] ?? ''
    urls.push(...(match[1]?.toLowerCase() === 'srcset' ? srcsetUrls(value) : [value]))
  }
  return urls.filter(Boolean)
}

function extractAnchorHrefs(html: string): string[] {
  return [...html.matchAll(/<a\s(?:[^>]*\s)?href\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)].map(
    (match) => match[1] ?? match[2] ?? '',
  )
}

export interface CheckLinksOptions {
  readonly linkCheck?: LinkCheckConfig
  // Output files written as redirect stubs. A link to one is valid as is; its
  // #fragment is not checked because a meta refresh drops it.
  readonly redirectStubs?: ReadonlySet<string>
  // Needed by `linkCheck.translationSiblings`.
  readonly translationGroups?: ReadonlyMap<string, readonly RenderPlan[]>
  readonly baseUrl?: string
}

function formatMissing(title: string, missing: readonly MissingLink[]): string {
  const details = missing
    .map(
      (miss) =>
        `- ${miss.href} from ${path.relative(process.cwd(), miss.fromFile)} -> missing ${path.relative(process.cwd(), miss.resolvedPath)}`,
    )
    .join('\n')
  return `${title}:\n${details}`
}

export async function checkLinks(
  outputDir: string,
  options: CheckLinksOptions = {},
): Promise<void> {
  const resolvedOutputDir = path.resolve(outputDir)
  const htmlFiles = await collectHtmlFiles(resolvedOutputDir)
  if (htmlFiles.length === 0) {
    logWarning('No generated HTML files found. Skipping link check.')
    return
  }

  const missing: MissingLink[] = []
  const missingAssets: MissingLink[] = []
  const checkAssets = options.linkCheck?.assets ?? true
  const redirectStubs = options.redirectStubs ?? new Set<string>()

  for (const file of htmlFiles) {
    const content = await readFile(file, 'utf-8')
    const hrefs = extractHrefs(content)
    const fileIds = extractIdsFromHtml(content)

    for (const href of hrefs) {
      if (isSkippableHref(href)) {
        continue
      }

      // Check same-page anchor links (just #anchor)
      if (href.startsWith('#')) {
        const anchor = href.slice(1)
        if (anchor) {
          // IDs are always normalized by slugifyAnchor, so normalize the anchor from href
          const normalizedAnchor = slugifyAnchor(anchor)
          if (!fileIds.has(normalizedAnchor)) {
            missing.push({
              fromFile: file,
              href,
              resolvedPath: `${file}#${anchor}`,
            })
          }
        }
        continue
      }

      const resolvedPath = resolveInternalPath(href, file, resolvedOutputDir)
      const { found, targetFile } = await findTargetFile(resolvedPath)

      if (!found) {
        missing.push({
          fromFile: file,
          href,
          resolvedPath,
        })
        continue
      }

      // Check anchor link if present
      const anchor = extractAnchor(href)
      if (anchor && targetFile && !redirectStubs.has(targetFile)) {
        try {
          const targetContent = await readFile(targetFile, 'utf-8')
          const ids = extractIdsFromHtml(targetContent)
          // IDs are always normalized by slugifyAnchor, so normalize the anchor from href
          const normalizedAnchor = slugifyAnchor(anchor)
          if (!ids.has(normalizedAnchor)) {
            missing.push({
              fromFile: file,
              href,
              resolvedPath: `${targetFile}#${anchor}`,
            })
          }
        } catch {
          // If we can't read the file, it's already reported as missing above
        }
      }
    }

    if (checkAssets) {
      for (const url of extractAssetUrls(content)) {
        if (ABSOLUTE_URL.test(url) || url.startsWith('//')) {
          continue
        }
        // Markdown percent-encodes image URLs ("my photo.png" renders as
        // my%20photo.png); the file on disk has the decoded name.
        const pathPart = url.split(/[?#]/)[0] ?? ''
        let decoded = pathPart
        try {
          decoded = decodeURI(pathPart)
        } catch {
          // A malformed escape is checked as written.
        }
        const resolvedPath = resolveInternalPath(decoded, file, resolvedOutputDir)
        // A bare relative src on a nested page (guides/x.html -> diagram.png)
        // is relative to the page in a browser, unlike resolveInternalPath's
        // site-root reading, so either location counts.
        const pageRelative = path.resolve(path.dirname(file), decoded)
        const found =
          (await findTargetFile(resolvedPath)).found ||
          (!url.startsWith('/') && (await findTargetFile(pageRelative)).found)
        if (!found) {
          missingAssets.push({ fromFile: file, href: url, resolvedPath })
        }
      }
    }
  }

  const missingSiblings = options.linkCheck?.translationSiblings
    ? await findMissingSiblingLinks(resolvedOutputDir, options)
    : []

  const sections = [
    missing.length > 0 ? formatMissing('Broken internal links found', missing) : '',
    missingAssets.length > 0 ? formatMissing('Broken asset references found', missingAssets) : '',
    missingSiblings.length > 0
      ? formatMissing('Translated pages missing a link to a sibling translation', missingSiblings)
      : '',
  ].filter(Boolean)

  if (sections.length > 0) {
    throw new Error(sections.join('\n'))
  }

  console.log('Link check passed: all internal links resolve.')
}

// Every page whose translation group has other languages must link to each of
// them with an <a>. hreflang <link> tags in the head do not count: they are
// for search engines, and a template without {{LANGUAGE_SWITCHER}} still
// emits them while leaving visitors no way across.
async function findMissingSiblingLinks(
  outputDir: string,
  options: CheckLinksOptions,
): Promise<MissingLink[]> {
  const missing: MissingLink[] = []
  const origin = options.baseUrl ? new URL(options.baseUrl).origin : null

  for (const group of options.translationGroups?.values() ?? []) {
    const langs = new Set(group.map((plan) => plan.meta.lang))
    if (langs.size < 2) {
      continue
    }
    for (const plan of group) {
      const content = await readFile(plan.outputPath, 'utf-8')
      const linked = new Set<string>()
      for (const href of extractAnchorHrefs(content)) {
        const local = origin && href.startsWith(`${origin}/`) ? href.slice(origin.length) : href
        if (isSkippableHref(local) || local.startsWith('#')) {
          continue
        }
        const { targetFile } = await findTargetFile(
          resolveInternalPath(local, plan.outputPath, outputDir),
        )
        if (targetFile) {
          linked.add(path.normalize(targetFile))
        }
      }
      // Slug-keyed groups can hold two pages in one language (index.md and
      // guides/index.md), so a link to either satisfies that language.
      for (const lang of langs) {
        const siblings = group.filter((entry) => entry.meta.lang === lang)
        if (
          lang === plan.meta.lang ||
          siblings.some((entry) => linked.has(path.normalize(entry.outputPath)))
        ) {
          continue
        }
        const sibling = siblings[0]!
        missing.push({
          fromFile: plan.outputPath,
          href: `/${normalizeIndexUrl(stripHtmlExtension(sibling.relativeOutput))}`,
          resolvedPath: sibling.outputPath,
        })
      }
    }
  }

  return missing
}

