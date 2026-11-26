import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildAlternateLinks, resolveCanonicalRelative, groupByTranslation, writeSitemap } from './sitemap.js'
import { toAbsoluteUrl } from './template.js'
import { normalizeIndexUrl } from './utils.js'
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
  expect(enLink?.href).toBe('https://example.com/sub/')
})

test('toAbsoluteUrl - normalizes index URLs in canonical', () => {
  const baseUrl = 'https://ropelabs.org'
  const normalizedPath = ''
  const url = toAbsoluteUrl(normalizedPath, baseUrl)
  expect(url).toBe('https://ropelabs.org/')
})

// The point of the trailing slash is that no emitted URL redirects. Both
// spellings of the root index have to land on the bare origin.
test('toAbsoluteUrl - both root index spellings resolve to the origin', () => {
  const baseUrl = 'https://ropelabs.org'
  expect(toAbsoluteUrl(normalizeIndexUrl('index'), baseUrl)).toBe('https://ropelabs.org/')
  expect(toAbsoluteUrl(normalizeIndexUrl('/index'), baseUrl)).toBe('https://ropelabs.org/')
  expect(toAbsoluteUrl(normalizeIndexUrl('fr/index'), baseUrl)).toBe('https://ropelabs.org/fr/')
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


function sitemapPlan(relativeOutput: string, meta: Partial<RenderPlan['meta']> = {}): RenderPlan {
  const slug = relativeOutput.replace(/^(fr|nl)\//, '').replace(/\.html$/, '')
  return {
    sourcePath: `/content/${relativeOutput.replace(/\.html$/, '.md')}`,
    outputPath: `/docs/${relativeOutput}`,
    relativeOutput,
    html: '<p>Content</p>',
    meta: {
      title: slug,
      description: slug,
      sidebarTitle: slug,
      sidebarSummary: slug,
      backLinkHref: '/',
      backLinkLabel: 'Back',
      slug,
      lang: relativeOutput.startsWith('fr/') ? 'fr' : 'en',
      output: relativeOutput,
      ...meta,
    },
  }
}

test('buildAlternateLinks - every translation names the default-language page as x-default', () => {
  const en = sitemapPlan('about.html')
  const fr = sitemapPlan('fr/about.html', { translationOf: 'about' })
  const groups = groupByTranslation([en, fr])
  for (const plan of [en, fr]) {
    const xDefault = buildAlternateLinks(plan, groups, 'https://example.com', 'en').find(
      (alt) => alt.lang === 'x-default',
    )
    expect(xDefault?.href).toBe('https://example.com/about')
  }
})

test('writeSitemap - writes <lastmod> after <loc> when the page has a date', async () => {
  await mkdir(TEST_DIR, { recursive: true })
  await writeSitemap(
    [sitemapPlan('dated.html', { lastModified: '2026-10-02' }), sitemapPlan('undated.html')],
    TEST_DIR,
    'https://example.com',
    'en',
  )
  const sitemap = await readFile(path.join(TEST_DIR, 'sitemap.xml'), 'utf-8')
  expect(sitemap).toContain(
    '    <loc>https://example.com/dated</loc>\n    <lastmod>2026-10-02</lastmod>',
  )
  expect(sitemap.match(/<lastmod>/g)).toHaveLength(1)
})

test('buildAlternateLinks - without a default-language page, the group still agrees on x-default', () => {
  const fr = sitemapPlan('fr/about.html', { translationOf: 'about' })
  const nl = { ...sitemapPlan('nl/about.html', { translationOf: 'about' }) }
  const nlPlan = { ...nl, meta: { ...nl.meta, lang: 'nl' } }
  const groups = groupByTranslation([fr, nlPlan])
  const xDefaults = [fr, nlPlan].map(
    (plan) => buildAlternateLinks(plan, groups, 'https://example.com', 'en').find((alt) => alt.lang === 'x-default')?.href,
  )
  expect(xDefaults[0]).toBe(xDefaults[1])
})

function plan(relativeOutput: string, lang: string, meta: Partial<RenderPlan['meta']> = {}): RenderPlan {
  return {
    sourcePath: `/content/${relativeOutput.replace(/\.html$/, '.md')}`,
    outputPath: `/docs/${relativeOutput}`,
    relativeOutput,
    html: '',
    meta: {
      title: 'Page',
      description: 'Page',
      slug: path.posix.basename(relativeOutput, '.html'),
      lang,
      output: relativeOutput,
      ...meta,
    },
  }
}

// Every directory has an index.md and filenames repeat across directories,
// so pages sharing a slug must still group apart by path.
const nestedSite = [
  plan('index.html', 'en'),
  plan('classes/index.html', 'en'),
  plan('classes/beginner.html', 'en'),
  plan('workshops/beginner.html', 'en'),
  plan('fr/index.html', 'fr', { translationOf: 'index' }),
  plan('fr/classes/index.html', 'fr', { translationOf: 'index' }),
  plan('fr/classes/debutant.html', 'fr', { translationOf: 'beginner' }),
  plan('fr/infos/a-propos.html', 'fr', { translationOf: '/workshops/beginner' }),
]

test('groupByTranslation - groups on the path without the language directory', () => {
  const groups = groupByTranslation(nestedSite)
  const outputs = (key: string) => groups.get(key)?.map((entry) => entry.relativeOutput)

  expect([...groups.keys()].sort()).toEqual([
    'classes/beginner',
    'classes/index',
    'index',
    'workshops/beginner',
  ])
  expect(outputs('index')).toEqual(['index.html', 'fr/index.html'])
  expect(outputs('classes/index')).toEqual(['classes/index.html', 'fr/classes/index.html'])
  expect(outputs('classes/beginner')).toEqual(['classes/beginner.html', 'fr/classes/debutant.html'])
  expect(outputs('workshops/beginner')).toEqual(['workshops/beginner.html', 'fr/infos/a-propos.html'])
})

test('buildAlternateLinks - nested index pages only list their own translations', () => {
  const groups = groupByTranslation(nestedSite)
  const home = buildAlternateLinks(nestedSite[0]!, groups, 'https://example.com', 'en')
  const classes = buildAlternateLinks(nestedSite[5]!, groups, 'https://example.com', 'en')

  expect(home).toEqual([
    { lang: 'en', href: 'https://example.com/' },
    { lang: 'fr', href: 'https://example.com/fr/' },
    { lang: 'x-default', href: 'https://example.com/' },
  ])
  expect(classes.filter((alt) => alt.lang !== 'x-default')).toEqual([
    { lang: 'en', href: 'https://example.com/classes/' },
    { lang: 'fr', href: 'https://example.com/fr/classes/' },
  ])
})

test('resolveCanonicalRelative - picks the page itself, not a namesake elsewhere', () => {
  const groups = groupByTranslation(nestedSite)
  expect(resolveCanonicalRelative(nestedSite[1]!, groups)).toBe('classes/index.html')
  expect(resolveCanonicalRelative(nestedSite[3]!, groups)).toBe('workshops/beginner.html')
})

test('writeSitemap - alternates pair nested pages with their own translations', async () => {
  await writeSitemap(nestedSite, TEST_DIR, 'https://example.com', 'en')
  const sitemap = await readFile(path.join(TEST_DIR, 'sitemap.xml'), 'utf-8')
  const entry = (loc: string) =>
    sitemap.split('<url>').find((row) => row.includes(`<loc>${loc}</loc>`)) ?? ''

  expect(entry('https://example.com/')).toContain('href="https://example.com/fr/"')
  expect(entry('https://example.com/')).not.toContain('classes')
  expect(entry('https://example.com/workshops/beginner')).toContain(
    'hreflang="fr" href="https://example.com/fr/infos/a-propos"',
  )
  expect(entry('https://example.com/workshops/beginner')).not.toContain('classes')
})
