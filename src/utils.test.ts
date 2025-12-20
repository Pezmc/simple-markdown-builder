import { test, expect } from 'bun:test'
import { serializeUtmParams, appendUtmParams, normalizeIndexUrl } from './utils.js'

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

test('appendUtmParams - no utm params', () => {
  const html = '<a href="https://example.com">Link</a>'
  const result = appendUtmParams(html, undefined, 'https://mysite.com')
  expect(result).toBe(html)
})

test('normalizeIndexUrl - removes /index suffix', () => {
  expect(normalizeIndexUrl('index')).toBe('')
  expect(normalizeIndexUrl('/index')).toBe('')
  expect(normalizeIndexUrl('path/index')).toBe('path')
  expect(normalizeIndexUrl('/path/index')).toBe('/path')
  expect(normalizeIndexUrl('other')).toBe('other')
  expect(normalizeIndexUrl('/other')).toBe('/other')
  expect(normalizeIndexUrl('')).toBe('')
})

