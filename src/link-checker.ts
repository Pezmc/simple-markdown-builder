import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { MissingLink } from './config.js'
import { collectHtmlFiles } from './utils.js'

const SKIP_PREFIXES = ['#', 'mailto:', 'tel:', 'javascript:', 'data:']
const SKIP_SCHEMES = ['http://', 'https://']

function isSkippableHref(href: string): boolean {
  return (
    !href ||
    SKIP_PREFIXES.some((prefix) => href.startsWith(prefix)) ||
    SKIP_SCHEMES.some((scheme) => href.startsWith(scheme))
  )
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
  const htmlFiles = await collectHtmlFiles(outputDir)
  if (htmlFiles.length === 0) {
    console.warn('No generated HTML files found. Skipping link check.')
    return
  }

  const missing: MissingLink[] = []

  for (const file of htmlFiles) {
    const content = await readFile(file, 'utf-8')
    const hrefs = extractHrefs(content)
    for (const href of hrefs) {
      if (isSkippableHref(href)) {
        continue
      }
      const resolvedPath = resolveInternalPath(href, file, outputDir)

      const normalizedResolved = path.normalize(resolvedPath)
      const pathVariations = [
        normalizedResolved,
        `${normalizedResolved}.html`,
        path.join(normalizedResolved, 'index.html'),
      ]

      let found = false
      for (const variation of pathVariations) {
        try {
          const normalizedVariation = path.normalize(variation)
          const stats = await stat(normalizedVariation)
          const checkPath = stats.isDirectory()
            ? path.join(normalizedVariation, 'index.html')
            : normalizedVariation
          await stat(checkPath)
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

