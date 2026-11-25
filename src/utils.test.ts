import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { serializeUtmParams, appendUtmParams, normalizeIndexUrl, obfuscateMailtoLinks, collectMarkdownFiles, collectHtmlFiles, extractSlugFromPath, normalizePathSeparators, slugifyAnchor } from './utils.js'

const TEST_DIR = path.join(process.cwd(), '.test-utils')

test('serializeUtmParams', () => {
  const params = {
    utm_campaign: 'test',
    utm_medium: 'website',
    utm_source: 'mysite',
  }
  const result = serializeUtmParams(params)
  expect(result).toContain('utm_campaign=test')
  expect(result).toContain('utm_medium=website')
  expect(result).toContain('utm_source=mysite')
})

test('appendUtmParams - external link', () => {
  const html = '<a href="https://example.com">Link</a>'
  const utmParams = {
    utm_campaign: 'test',
    utm_source: 'mysite',
  }
  const result = appendUtmParams(html, utmParams, 'https://mysite.com')
  expect(result).toContain('utm_campaign=test')
  expect(result).toContain('utm_source=mysite')
})

test('appendUtmParams - internal link', () => {
  const html = '<a href="https://mysite.com/page">Link</a>'
  const utmParams = {
    utm_campaign: 'test',
  }
  const result = appendUtmParams(html, utmParams, 'https://mysite.com')
  expect(result).not.toContain('utm_campaign')
})

const UTM = { utm_campaign: 'c', utm_source: 's' }
const hrefOf = (html: string) => html.match(/href="([^"]+)"/)?.[1]

test('appendUtmParams - fragment without query', () => {
  const html = '<a href="https://example.com/page#section">Link</a>'
  const result = appendUtmParams(html, UTM, 'https://mysite.com')
  expect(hrefOf(result)).toBe('https://example.com/page?utm_campaign=c&amp;utm_source=s#section')
})

test('appendUtmParams - query and fragment', () => {
  const html =
    '<a href="https://map.why2025.org/?building=13&amp;building_table=buildings#maphash=19/52.69/4.74/-20">Link</a>'
  const result = appendUtmParams(html, UTM, 'https://mysite.com')
  expect(hrefOf(result)).toBe(
    'https://map.why2025.org/?building=13&amp;building_table=buildings&amp;utm_campaign=c&amp;utm_source=s#maphash=19/52.69/4.74/-20',
  )
})

test('appendUtmParams - fragment containing ? and & leaves the fragment intact', () => {
  const html =
    '<a href="https://map.why2025.org/#17.97/52.69/4.74&amp;maphash=19.82/52.69/4.74/-20?x=1">Link</a>'
  const result = appendUtmParams(html, UTM, 'https://mysite.com')
  expect(hrefOf(result)).toBe(
    'https://map.why2025.org/?utm_campaign=c&amp;utm_source=s#17.97/52.69/4.74&amp;maphash=19.82/52.69/4.74/-20?x=1',
  )
})

test('appendUtmParams - fragment URL already carrying utm_campaign is untouched', () => {
  const html = '<a href="https://example.com/?utm_campaign=other#section">Link</a>'
  const result = appendUtmParams(html, UTM, 'https://mysite.com')
  expect(hrefOf(result)).toBe('https://example.com/?utm_campaign=other#section')
})

test('appendUtmParams - external links get rel="noopener" by default', () => {
  const html = '<a href="https://example.com">Link</a>'
  const result = appendUtmParams(html, UTM, 'https://mysite.com')
  expect(result).toContain(' target="_blank" rel="noopener">')
})

test('appendUtmParams - noreferrer opt-in adds it to rel', () => {
  const html = '<a href="https://example.com">Link</a>'
  const result = appendUtmParams(html, UTM, 'https://mysite.com', true)
  expect(result).toContain(' target="_blank" rel="noopener noreferrer">')
})

test('appendUtmParams - internal links get no target or rel', () => {
  const html = '<a href="https://mysite.com/page">Link</a>'
  const result = appendUtmParams(html, UTM, 'https://mysite.com', true)
  expect(result).toBe(html)
})

test('appendUtmParams - no utm params', () => {
  const html = '<a href="https://example.com">Link</a>'
  const result = appendUtmParams(html, undefined, 'https://mysite.com')
  expect(result).toBe(html)
})

test('normalizeIndexUrl - a directory index normalizes to the directory', () => {
  // Root index is the site root. Both spellings render as "/" through
  // toAbsoluteUrl, which prefixes a slash and collapses leading ones.
  expect(normalizeIndexUrl('index')).toBe('')
  expect(normalizeIndexUrl('/index')).toBe('/')
  // A nested index keeps the trailing slash, so the URL does not 301.
  expect(normalizeIndexUrl('path/index')).toBe('path/')
  expect(normalizeIndexUrl('/path/index')).toBe('/path/')
  expect(normalizeIndexUrl('a/b/index')).toBe('a/b/')
  // Anything that is not an index is untouched, including a path merely
  // containing the word.
  expect(normalizeIndexUrl('other')).toBe('other')
  expect(normalizeIndexUrl('/other')).toBe('/other')
  expect(normalizeIndexUrl('index/page')).toBe('index/page')
  expect(normalizeIndexUrl('reindex')).toBe('reindex')
  expect(normalizeIndexUrl('')).toBe('')
})

test('obfuscateMailtoLinks - obfuscates email addresses', () => {
  const html = '<a href="mailto:test@example.com">Email</a>'
  const result = obfuscateMailtoLinks(html)
  expect(result).toContain('data-email-link')
  expect(result).toContain('data-email')
  expect(result).toContain('data-user')
  expect(result).toContain('data-domain')
  expect(result).not.toContain('test@example.com')
})

test('obfuscateMailtoLinks - handles email with query params', () => {
  const html = '<a href="mailto:test@example.com?subject=Hello">Email</a>'
  const result = obfuscateMailtoLinks(html)
  expect(result).toContain('data-email-link')
  expect(result).not.toContain('test@example.com')
})

test('obfuscateMailtoLinks - leaves non-mailto links unchanged', () => {
  const html = '<a href="https://example.com">Link</a>'
  const result = obfuscateMailtoLinks(html)
  expect(result).toBe(html)
})

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
  await mkdir(TEST_DIR, { recursive: true })
})

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

test('collectMarkdownFiles - collects markdown files recursively', async () => {
  await mkdir(path.join(TEST_DIR, 'sub'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'page1.md'), '# Page 1')
  await writeFile(path.join(TEST_DIR, 'sub', 'page2.md'), '# Page 2')
  await writeFile(path.join(TEST_DIR, 'not-markdown.txt'), 'Not markdown')

  const files = await collectMarkdownFiles(TEST_DIR)
  expect(files.length).toBe(2)
  expect(files.some((f) => f.endsWith('page1.md'))).toBe(true)
  expect(files.some((f) => f.endsWith('page2.md'))).toBe(true)
  expect(files.some((f) => f.endsWith('not-markdown.txt'))).toBe(false)
})

test('collectHtmlFiles - collects HTML files recursively', async () => {
  await mkdir(path.join(TEST_DIR, 'sub'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'page1.html'), '<html></html>')
  await writeFile(path.join(TEST_DIR, 'sub', 'page2.html'), '<html></html>')
  await writeFile(path.join(TEST_DIR, 'not-html.txt'), 'Not HTML')

  const files = await collectHtmlFiles(TEST_DIR)
  expect(files.length).toBe(2)
  expect(files.some((f) => f.endsWith('page1.html'))).toBe(true)
  expect(files.some((f) => f.endsWith('page2.html'))).toBe(true)
  expect(files.some((f) => f.endsWith('not-html.txt'))).toBe(false)
})

test('extractSlugFromPath - extracts slug from markdown file path', () => {
  expect(extractSlugFromPath('/path/to/page.md')).toBe('page')
  expect(extractSlugFromPath('index.md')).toBe('index')
  expect(extractSlugFromPath('my-page.md')).toBe('my-page')
})

test('normalizePathSeparators - normalizes Windows paths to forward slashes', () => {
  expect(normalizePathSeparators('path\\to\\file')).toBe('path/to/file')
  expect(normalizePathSeparators('path/to/file')).toBe('path/to/file')
  expect(normalizePathSeparators('path\\to\\file.html')).toBe('path/to/file.html')
})


test('slugifyAnchor - folds accents and ligatures to plain letters', () => {
  expect(slugifyAnchor('Les leçons')).toBe('les-lecons')
  expect(slugifyAnchor('Leçons particulières à Louvain')).toBe('lecons-particulieres-a-louvain')
  expect(slugifyAnchor('Œuvre & Æther')).toBe('oeuvre-aether')
  expect(slugifyAnchor('Søren Straße')).toBe('soren-strasse')
})
