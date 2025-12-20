import path from 'node:path'
import { readdir } from 'node:fs/promises'
import type { UtmParams } from './config.js'

const ZERO_WIDTH_SPACE = '&#8203;'

export function serializeUtmParams(utmParams: UtmParams): string {
  return Object.entries(utmParams)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

export function appendUtmParams(
  html: string,
  utmParams: UtmParams | undefined,
  baseUrl: string,
): string {
  if (!utmParams) {
    return html
  }

  const utmString = serializeUtmParams(utmParams)
  const baseHost = new URL(baseUrl).hostname

  return html.replace(/href="(https?:\/\/[^"]+)"/g, (fullMatch, hrefValue) => {
    const decoded = hrefValue.replace(/&amp;/g, '&')
    let host = ''
    try {
      host = new URL(decoded).hostname
    } catch {
      return fullMatch
    }

    const isInternal = host.endsWith(baseHost)
    const needsUtm = !decoded.includes('utm_campaign=') && !isInternal
    const updated = needsUtm
      ? `${decoded}${decoded.includes('?') ? '&' : '?'}${utmString}`
      : decoded

    const escaped = updated.replace(/&/g, '&amp;')
    const externalAttrs = isInternal
      ? ''
      : ' target="_blank" rel="noopener noreferrer"'
    return `href="${escaped}"${externalAttrs}`
  })
}

export function obfuscateMailtoLinks(html: string): string {
  const mailtoPattern = /<a([^>]*?)href="mailto:([^"]+)"([^>]*)>.*?<\/a>/gi
  return html.replace(
    mailtoPattern,
    (
      fullMatch,
      beforeHref: string,
      emailWithExtras: string,
      afterHref: string,
    ) => {
      const [address] = emailWithExtras.split('?')
      if (!address || !address.includes('@')) {
        return fullMatch
      }
      const [user, domain] = address.split('@')
      if (!user || !domain) {
        return fullMatch
      }

      const obfuscated = address.split('').join(ZERO_WIDTH_SPACE)
      const encodedUser = Buffer.from(user).toString('base64')
      const encodedDomain = Buffer.from(domain).toString('base64')
      const mergedAttrs = `${beforeHref ?? ''}${afterHref ?? ''}`.trim()
      const extraAttrs = mergedAttrs ? ` ${mergedAttrs}` : ''

      return `<a data-email-link href="#"${extraAttrs}><span data-email data-user="${encodedUser}" data-domain="${encodedDomain}">${obfuscated}</span></a>`
    },
  )
}

export async function collectMarkdownFiles(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return collectMarkdownFiles(fullPath)
      }
      return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : []
    }),
  )
  return files.flat()
}

export async function collectHtmlFiles(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return collectHtmlFiles(fullPath)
      }
      return entry.isFile() && fullPath.endsWith('.html') ? [fullPath] : []
    }),
  )
  return files.flat()
}

export function stripHtmlExtension(url: string): string {
  return url.replace(/\.html?$/i, '')
}

export function normalizeIndexUrl(path: string): string {
  // Normalize paths ending with /index or just index to empty string (base URL)
  const normalized = path.replace(/\/index$/, '').replace(/^index$/, '')
  return normalized
}

export function slugifyAnchor(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

