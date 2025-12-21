import { test, expect } from 'bun:test'
import { escapeHtml, toAbsoluteUrl, cleanUrl } from './template.js'
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

