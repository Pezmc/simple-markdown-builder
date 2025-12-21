import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildAlternateLinks, resolveCanonicalRelative, groupByTranslation, writeSitemap } from './sitemap.js'
import { toAbsoluteUrl } from './template.js'
import type { RenderPlan } from './config.js'

const TEST_DIR = path.join(process.cwd(), '.test-sitemap')

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

test('groupByTranslation - groups plans by translationOf or slug', () => {
  const plans: RenderPlan[] = [
    {
      sourcePath: '/content/page.md',
      outputPath: '/docs/page.html',
      relativeOutput: 'page.html',
      html: '<p>Content</p>',
      meta: {
        title: 'Page',
        description: 'Page',
        sidebarTitle: 'Page',
        sidebarSummary: 'Page',
        backLinkHref: '/',
        backLinkLabel: 'Back',
        slug: 'page',
        lang: 'en',
        output: 'page.html',
        translationOf: 'page',
      },
    },
    {
      sourcePath: '/content/fr/page.md',
      outputPath: '/docs/fr/page.html',
      relativeOutput: 'fr/page.html',
      html: '<p>Contenu</p>',
      meta: {
        title: 'Page',
        description: 'Page',
        sidebarTitle: 'Page',
        sidebarSummary: 'Page',
        backLinkHref: '/',
        backLinkLabel: 'Back',
        slug: 'page',
        lang: 'fr',
        output: 'fr/page.html',
        translationOf: 'page',
      },
    },
  ]

  const groups = groupByTranslation(plans)
  expect(groups.size).toBe(1)
  expect(groups.get('page')?.length).toBe(2)
})

test('resolveCanonicalRelative - returns English version when available', () => {
  const plans: RenderPlan[] = [
    {
      sourcePath: '/content/page.md',
      outputPath: '/docs/page.html',
      relativeOutput: 'page.html',
      html: '<p>Content</p>',
      meta: {
        title: 'Page',
        description: 'Page',
        sidebarTitle: 'Page',
        sidebarSummary: 'Page',
        backLinkHref: '/',
        backLinkLabel: 'Back',
        slug: 'page',
        lang: 'en',
        output: 'page.html',
        translationOf: 'page',
      },
    },
    {
      sourcePath: '/content/fr/page.md',
      outputPath: '/docs/fr/page.html',
      relativeOutput: 'fr/page.html',
      html: '<p>Contenu</p>',
      meta: {
        title: 'Page',
        description: 'Page',
        sidebarTitle: 'Page',
        sidebarSummary: 'Page',
        backLinkHref: '/',
        backLinkLabel: 'Back',
        slug: 'page',
        lang: 'fr',
        output: 'fr/page.html',
        translationOf: 'page',
      },
    },
  ]

  const groups = groupByTranslation(plans)
  // resolveCanonicalRelative uses the plan's own lang to find defaultLang in group
  // So for the French plan, it looks for lang='fr' in the group, not 'en'
  // The function finds the English version by looking for defaultLang in the group
  const canonical = resolveCanonicalRelative(plans[0], groups)
  expect(canonical).toBe('page.html')
  
  // For French plan, it returns its own output if no matching defaultLang found
  const canonicalFr = resolveCanonicalRelative(plans[1], groups)
  expect(canonicalFr).toBe('fr/page.html')
})

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
  await mkdir(TEST_DIR, { recursive: true })
})

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

test('writeSitemap - excludes noindex pages', async () => {
  const plans: RenderPlan[] = [
    {
      sourcePath: '/content/page1.md',
      outputPath: '/docs/page1.html',
      relativeOutput: 'page1.html',
      html: '<p>Content</p>',
      meta: {
        title: 'Page 1',
        description: 'Page 1',
        sidebarTitle: 'Page 1',
        sidebarSummary: 'Page 1',
        backLinkHref: '/',
        backLinkLabel: 'Back',
        slug: 'page1',
        output: 'page1.html',
        noindex: true,
      },
    },
    {
      sourcePath: '/content/page2.md',
      outputPath: '/docs/page2.html',
      relativeOutput: 'page2.html',
      html: '<p>Content</p>',
      meta: {
        title: 'Page 2',
        description: 'Page 2',
        sidebarTitle: 'Page 2',
        sidebarSummary: 'Page 2',
        backLinkHref: '/',
        backLinkLabel: 'Back',
        slug: 'page2',
        output: 'page2.html',
      },
    },
  ]

  await writeSitemap(plans, TEST_DIR, 'https://example.com', 'en')
  const sitemap = await readFile(path.join(TEST_DIR, 'sitemap.xml'), 'utf-8')
  expect(sitemap).not.toContain('page1')
  expect(sitemap).toContain('page2')
})

