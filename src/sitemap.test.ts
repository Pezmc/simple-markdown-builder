import { test, expect } from 'bun:test'
import { buildAlternateLinks, resolveCanonicalRelative, groupByTranslation } from './sitemap.js'
import { toAbsoluteUrl } from './template.js'
import type { RenderPlan } from './config.js'

test('buildAlternateLinks - normalizes index URLs', () => {
  const baseUrl = 'https://ropelabs.org'
  const plan: RenderPlan = {
    sourcePath: '/content/index.md',
    outputPath: '/docs/index.html',
    relativeOutput: 'index.html',
    html: '<p>Content</p>',
    meta: {
      title: 'Home',
      description: 'Home page',
      slug: 'index',
      lang: 'en',
      output: 'index.html',
    },
  }

  const groups = groupByTranslation([plan])
  const alternates = buildAlternateLinks(plan, groups, baseUrl, 'en')

  // Should normalize index to base URL
  expect(alternates).toHaveLength(2) // one language + x-default
  const enLink = alternates.find((alt) => alt.lang === 'en')
  expect(enLink).toBeDefined()
  expect(enLink?.href).toBe('https://ropelabs.org/')
  
  const xDefaultLink = alternates.find((alt) => alt.lang === 'x-default')
  expect(xDefaultLink).toBeDefined()
  expect(xDefaultLink?.href).toBe('https://ropelabs.org/')
})

test('buildAlternateLinks - normalizes /index in path', () => {
  const baseUrl = 'https://example.com'
  const plan: RenderPlan = {
    sourcePath: '/content/sub/index.md',
    outputPath: '/docs/sub/index.html',
    relativeOutput: 'sub/index.html',
    html: '<p>Content</p>',
    meta: {
      title: 'Sub',
      description: 'Sub page',
      slug: 'index',
      lang: 'en',
      output: 'sub/index.html',
    },
  }

  const groups = groupByTranslation([plan])
  const alternates = buildAlternateLinks(plan, groups, baseUrl, 'en')

  const enLink = alternates.find((alt) => alt.lang === 'en')
  expect(enLink?.href).toBe('https://example.com/sub')
})

test('toAbsoluteUrl - normalizes index URLs in canonical', () => {
  const baseUrl = 'https://ropelabs.org'
  const normalizedPath = ''
  const url = toAbsoluteUrl(normalizedPath, baseUrl)
  expect(url).toBe('https://ropelabs.org/')
})

