import type { FrontMatter } from './config.js'

const FRONT_MATTER_BOUNDARY = /^---\s*$/

export function extractFrontMatter(raw: string): {
  readonly body: string
  readonly meta: FrontMatter
} {
  const lines = raw.split(/\r?\n/)

  if (lines[0]?.match(FRONT_MATTER_BOUNDARY) !== null) {
    const endIndex = lines.findIndex(
      (line, index) => index > 0 && line.match(FRONT_MATTER_BOUNDARY),
    )
    if (endIndex > 0) {
      const metaLines = lines.slice(1, endIndex)
      const bodyLines = lines.slice(endIndex + 1)
      return {
        body: bodyLines.join('\n').trim(),
        meta: parseMeta(metaLines),
      }
    }
  }

  return {
    body: raw.trim(),
    meta: {},
  }
}

function parseMeta(lines: string[]): FrontMatter {
  return lines.reduce<FrontMatter>((acc, line) => {
    const [key, ...rest] = line.split(':')
    if (!key || rest.length === 0) {
      return acc
    }
    const rawValue = rest.join(':').trim()
    const keyName = key.trim() as keyof FrontMatter

    // Handle boolean fields
    if (keyName === 'noindex' || keyName === 'translate') {
      const normalized = rawValue.toLowerCase()
      const value =
        normalized === 'true' || normalized === 'yes' || normalized === '1'
      return {
        ...acc,
        [keyName]: value,
      }
    }

    const value = parseMetaValue(rawValue)
    return {
      ...acc,
      [keyName]: value,
    }
  }, {})
}

function parseMetaValue(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"')) {
    return raw
  }

  const inner = raw.slice(1, -1)
  return inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

export function sanitizeSlug(value: string): string {
  // If the slug contains slashes, preserve directory structure
  if (value.includes('/')) {
    return value
      .split('/')
      .map((segment) => sanitizeSlugSegment(segment))
      .filter((segment) => segment.length > 0)
      .join('/')
  }
  return sanitizeSlugSegment(value)
}

function sanitizeSlugSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'page'
  )
}

export function sanitizeLang(input: string, supportedLangs: readonly string[], defaultLang: string): string {
  const normalized = input?.toLowerCase()
  if (normalized && supportedLangs.includes(normalized)) {
    return normalized
  }
  return defaultLang
}

export function isBooleanEnabled(value: string | boolean | undefined): boolean {
  if (value === undefined || value === false) {
    return false
  }
  if (typeof value === 'boolean') {
    return value
  }
  const normalized = value.trim().toLowerCase()
  return ['true', 'yes', '1'].includes(normalized)
}

