import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { MissingLink } from './config.js'
import { collectHtmlFiles, slugifyAnchor } from './utils.js'

const SKIP_PREFIXES = ['mailto:', 'tel:', 'javascript:', 'data:']
const SKIP_SCHEMES = ['http://', 'https://']

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
    const rootResolved = path.normalize(path.join(outputDir, withoutQuery))
    return rootResolved
  }
  return path.normalize(path.resolve(path.dirname(fromFile), withoutQuery))
}

function extractHrefs(html: string): string[] {
  const matches = html.match(/href="([^"]+)"/g) ?? []
  return matches.map((match) => match.slice(6, -1))
}

export async function checkLinks(outputDir: string): Promise<void> {
  const resolvedOutputDir = path.resolve(outputDir)
  const htmlFiles = await collectHtmlFiles(resolvedOutputDir)
  if (htmlFiles.length === 0) {
    console.warn('No generated HTML files found. Skipping link check.')
    return
  }

  const missing: MissingLink[] = []

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

      const normalizedResolved = path.normalize(resolvedPath)
      const pathVariations = [
        normalizedResolved,
        `${normalizedResolved}.html`,
        path.join(normalizedResolved, 'index.html'),
      ]

      let found = false
      let targetFile: string | null = null
      for (const variation of pathVariations) {
        try {
          const normalizedVariation = path.normalize(variation)
          const stats = await stat(normalizedVariation)
          const checkPath = stats.isDirectory()
            ? path.join(normalizedVariation, 'index.html')
            : normalizedVariation
          await stat(checkPath)
          targetFile = checkPath
          found = true
          break
        } catch {
          // Continue to next variation
        }
      }

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
      if (anchor && targetFile) {
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
  }

  if (missing.length > 0) {
    const details = missing
      .map(
        (miss) =>
          `- ${miss.href} from ${path.relative(process.cwd(), miss.fromFile)} -> missing ${path.relative(process.cwd(), miss.resolvedPath)}`,
      )
      .join('\n')
    throw new Error(`Broken internal links found:\n${details}`)
  }

  console.log('Link check passed: all internal links resolve.')
}

