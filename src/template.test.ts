import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { escapeHtml, toAbsoluteUrl, cleanUrl, renderTemplate } from './template.js'
import type { PageMeta } from './config.js'

test('escapeHtml - escapes special characters', () => {
  expect(escapeHtml('Hello & World')).toBe('Hello &amp; World')
  expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  expect(escapeHtml("It's working")).toBe('It&#039;s working')
  expect(escapeHtml(undefined)).toBe('')
  expect(escapeHtml('')).toBe('')
})

test('toAbsoluteUrl - converts relative path to absolute URL', () => {
  expect(toAbsoluteUrl('page', 'https://example.com')).toBe('https://example.com/page')
  expect(toAbsoluteUrl('/page', 'https://example.com')).toBe('https://example.com/page')
  expect(toAbsoluteUrl('sub/page', 'https://example.com')).toBe('https://example.com/sub/page')
  expect(toAbsoluteUrl('', 'https://example.com')).toBe('https://example.com/')
})

test('cleanUrl - removes .html extension and normalizes index', () => {
  expect(cleanUrl('page.html', 'https://example.com')).toBe('https://example.com/page')
  expect(cleanUrl('index.html', 'https://example.com')).toBe('https://example.com/')
  // cleanUrl only handles root-level index, not nested paths
  expect(cleanUrl('sub/index.html', 'https://example.com')).toBe('https://example.com/sub/index')
  expect(cleanUrl('page', 'https://example.com')).toBe('https://example.com/page')
})

const TEST_TEMPLATE_DIR = path.join(process.cwd(), '.test-template')

beforeEach(async () => {
  await rm(TEST_TEMPLATE_DIR, { recursive: true, force: true })
  await mkdir(TEST_TEMPLATE_DIR, { recursive: true })
})

afterEach(async () => {
  await rm(TEST_TEMPLATE_DIR, { recursive: true, force: true })
})

test('renderTemplate - generates meta tags with ogImage', async () => {
  const templatePath = path.join(TEST_TEMPLATE_DIR, 'template.html')
  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html>
<head>
  <title>{{TITLE}}</title>
</head>
<body>{{BODY}}</body>
</html>`,
  )

  const meta: PageMeta = {
    title: 'Test Page',
    description: 'Test Description',
    sidebarTitle: 'Test',
    sidebarSummary: 'Test',
    backLinkHref: '/',
    backLinkLabel: 'Back',
    output: 'test.html',
    ogImage: 'img/test-og.png',
  }

  const result = await renderTemplate(
    '<p>Body content</p>',
    meta,
    templatePath,
    'https://example.com',
  )

  expect(result).toContain('<meta property="og:url" content="https://example.com/test" />')
  expect(result).toContain('<meta property="og:title" content="Test Page" />')
  expect(result).toContain('<meta property="og:description" content="Test Description" />')
  expect(result).toContain('<meta property="og:image" content="https://example.com/img/test-og.png" />')
  expect(result).toContain('<meta name="twitter:card" content="summary_large_image" />')
  expect(result).not.toContain('<meta name="twitter:image"')
})

test('renderTemplate - uses twitterImage when provided', async () => {
  const templatePath = path.join(TEST_TEMPLATE_DIR, 'template.html')
  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html>
<head>
  <title>{{TITLE}}</title>
</head>
<body>{{BODY}}</body>
</html>`,
  )

  const meta: PageMeta = {
    title: 'Test Page',
    description: 'Test Description',
    sidebarTitle: 'Test',
    sidebarSummary: 'Test',
    backLinkHref: '/',
    backLinkLabel: 'Back',
    output: 'test.html',
    ogImage: 'img/test-og.png',
    twitterImage: 'img/test-twitter.png',
  }

  const result = await renderTemplate(
    '<p>Body content</p>',
    meta,
    templatePath,
    'https://example.com',
  )

  expect(result).toContain('<meta property="og:image" content="https://example.com/img/test-og.png" />')
  expect(result).toContain('<meta name="twitter:image" content="https://example.com/img/test-twitter.png" />')
})

test('renderTemplate - omits twitterImage when not explicitly set', async () => {
  const templatePath = path.join(TEST_TEMPLATE_DIR, 'template.html')
  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html>
<head>
  <title>{{TITLE}}</title>
</head>
<body>{{BODY}}</body>
</html>`,
  )

  const meta: PageMeta = {
    title: 'Test Page',
    description: 'Test Description',
    sidebarTitle: 'Test',
    sidebarSummary: 'Test',
    backLinkHref: '/',
    backLinkLabel: 'Back',
    output: 'test.html',
    ogImage: 'img/test-og.png',
  }

  const result = await renderTemplate(
    '<p>Body content</p>',
    meta,
    templatePath,
    'https://example.com',
  )

  expect(result).toContain('<meta property="og:image" content="https://example.com/img/test-og.png" />')
  expect(result).not.toContain('<meta name="twitter:image"')
})

test('renderTemplate - omits ogImage and twitterImage tags when not provided', async () => {
  const templatePath = path.join(TEST_TEMPLATE_DIR, 'template.html')
  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html>
<head>
  <title>{{TITLE}}</title>
</head>
<body>{{BODY}}</body>
</html>`,
  )

  const meta: PageMeta = {
    title: 'Test Page',
    description: 'Test Description',
    sidebarTitle: 'Test',
    sidebarSummary: 'Test',
    backLinkHref: '/',
    backLinkLabel: 'Back',
    output: 'test.html',
  }

  const result = await renderTemplate(
    '<p>Body content</p>',
    meta,
    templatePath,
    'https://example.com',
  )

  expect(result).toContain('<meta property="og:url" content="https://example.com/test" />')
  expect(result).toContain('<meta property="og:title" content="Test Page" />')
  expect(result).toContain('<meta property="og:description" content="Test Description" />')
  expect(result).not.toContain('<meta property="og:image"')
  expect(result).not.toContain('<meta name="twitter:image"')
  // Note: console.warn will be called, but we don't mock it in bun tests
})

