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
  expect(cleanUrl('sub/index.html', 'https://example.com')).toBe('https://example.com/sub/')
  expect(cleanUrl('a/b/index.html', 'https://example.com')).toBe('https://example.com/a/b/')
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

test('renderTemplate - renders the language switcher as a nav landmark with semantic classes', async () => {
  const templatePath = path.join(TEST_TEMPLATE_DIR, 'switcher-template.html')
  await writeFile(
    templatePath,
    '<html><head><title>{{TITLE}}</title></head><body>{{LANGUAGE_SWITCHER}}{{BODY}}</body></html>',
  )

  const meta: PageMeta = {
    title: 'À propos',
    description: 'Test',
    sidebarTitle: 'Test',
    sidebarSummary: 'Test',
    backLinkHref: '/',
    backLinkLabel: 'Back',
    output: 'fr/about.html',
    lang: 'fr',
  }

  const result = await renderTemplate('<p>Body</p>', meta, templatePath, 'https://example.com', false, undefined, [
    { lang: 'en', href: 'https://example.com/about' },
    { lang: 'fr', href: 'https://example.com/fr/about' },
    { lang: 'x-default', href: 'https://example.com/about' },
  ])

  expect(result).toContain(
    '<nav class="smb-lang-switch" aria-label="Language">' +
      '<a href="/about" hreflang="en" class="smb-lang-switch__item">EN</a>' +
      '<span class="smb-lang-switch__item is-active" aria-current="page">FR</span>' +
      '</nav>',
  )
})

const SEO_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <title>{{TITLE}}</title>
</head>
<body>{{BODY}}<p class="updated"><time datetime="{{UPDATED_ISO}}">{{UPDATED}}</time></p></body>
</html>`

function seoMeta(overrides: Partial<PageMeta> = {}): PageMeta {
  return {
    title: 'Test Page',
    description: 'Test Description',
    sidebarTitle: 'Test',
    sidebarSummary: 'Test',
    backLinkHref: '/',
    backLinkLabel: 'Back',
    output: 'about.html',
    lang: 'en',
    ogImage: 'img/og.png',
    ...overrides,
  }
}

async function renderSeo(
  meta: PageMeta,
  ...rest: [alternates?: Parameters<typeof renderTemplate>[6], canonical?: string, options?: Parameters<typeof renderTemplate>[8]]
): Promise<string> {
  const templatePath = path.join(TEST_TEMPLATE_DIR, 'seo.html')
  await writeFile(templatePath, SEO_TEMPLATE)
  return renderTemplate('<p>Body</p>', meta, templatePath, 'https://example.com', false, undefined, ...rest)
}

const EN_FR_ALTERNATES = [
  { lang: 'en', href: 'https://example.com/about' },
  { lang: 'fr', href: 'https://example.com/fr/about' },
  { lang: 'x-default', href: 'https://example.com/about' },
]

test('renderTemplate - emits the x-default hreflang', async () => {
  const result = await renderSeo(seoMeta(), EN_FR_ALTERNATES)
  expect(result).toContain('<link rel="alternate" href="https://example.com/about" hreflang="x-default" />')
  expect(result).toContain('<link rel="alternate" href="https://example.com/fr/about" hreflang="fr" />')
})

test('renderTemplate - emits og:type, og:locale and og:locale:alternate', async () => {
  const result = await renderSeo(seoMeta({ lang: 'fr', output: 'fr/about.html' }), EN_FR_ALTERNATES)
  expect(result).toContain('<meta property="og:type" content="website" />')
  expect(result).toContain('<meta property="og:locale" content="fr_FR" />')
  expect(result).toContain('<meta property="og:locale:alternate" content="en_US" />')
  expect(result).not.toContain('og:locale:alternate" content="fr_FR"')
  expect(result.match(/og:locale:alternate/g)).toHaveLength(1)
})

test('renderTemplate - og:type comes from front-matter ogType and locales are language_TERRITORY', async () => {
  const result = await renderSeo(seoMeta({ ogType: 'article', lang: 'pt-br' }))
  expect(result).toContain('<meta property="og:type" content="article" />')
  expect(result).toContain('<meta property="og:locale" content="pt_BR" />')
  expect(await renderSeo(seoMeta({ lang: 'nl' }))).toContain('<meta property="og:locale" content="nl_NL" />')
})

test('renderTemplate - og:locale:alternate lists each locale once', async () => {
  const result = await renderSeo(seoMeta(), [
    { lang: 'en', href: 'https://example.com/a' },
    { lang: 'fr', href: 'https://example.com/fr/a' },
    { lang: 'fr', href: 'https://example.com/fr/b' },
  ])
  expect(result.match(/og:locale:alternate" content="fr_FR"/g)).toHaveLength(1)
})

test('renderTemplate - og:image dimensions follow og:image only when set', async () => {
  const withSize = await renderSeo(seoMeta({ ogImageWidth: '1200', ogImageHeight: '630' }))
  expect(withSize).toContain(
    '<meta property="og:image" content="https://example.com/img/og.png" />\n' +
      '    <meta property="og:image:width" content="1200" />\n' +
      '    <meta property="og:image:height" content="630" />',
  )
  const withoutSize = await renderSeo(seoMeta())
  expect(withoutSize).not.toContain('og:image:width')
  const withoutImage = await renderSeo(seoMeta({ ogImage: undefined, ogImageWidth: '1200' }))
  expect(withoutImage).not.toContain('og:image:width')
})

test('renderTemplate - {{UPDATED}} and {{UPDATED_ISO}} render the page date in its language', async () => {
  const en = await renderSeo(seoMeta({ lastModified: '2026-11-01' }))
  expect(en).toContain('<time datetime="2026-11-01">November 1, 2026</time>')
  const fr = await renderSeo(seoMeta({ lang: 'fr', lastModified: '2026-11-01' }))
  expect(fr).toContain('<time datetime="2026-11-01">1 novembre 2026</time>')
})

test('renderTemplate - {{UPDATED}} placeholders are empty without a date', async () => {
  const result = await renderSeo(seoMeta())
  expect(result).toContain('<time datetime=""></time>')
})

test('renderTemplate - injects JSON-LD before </head> and escapes </script', async () => {
  const result = await renderSeo(seoMeta(), undefined, undefined, {
    jsonLd: { '@type': 'WebPage', name: '</script><script>alert(1)</script>', note: "$& $'" },
  })
  const script = result.match(/<script type="application\/ld\+json">(.*?)<\/script>/)
  expect(script).not.toBeNull()
  expect(script![1]).not.toContain('</script')
  expect(JSON.parse(script![1]!)).toEqual({
    '@type': 'WebPage',
    name: '</script><script>alert(1)</script>',
    note: "$& $'",
  })
  expect(result.indexOf('application/ld+json')).toBeLessThan(result.indexOf('</head>'))
})

test('renderTemplate - accepts a JSON-LD array and emits nothing without one', async () => {
  const withArray = await renderSeo(seoMeta(), undefined, undefined, { jsonLd: [{ a: 1 }, { b: 2 }] })
  expect(withArray).toContain('<script type="application/ld+json">[{"a":1},{"b":2}]</script>')
  const without = await renderSeo(seoMeta())
  expect(without).not.toContain('application/ld+json')
})

test('renderTemplate - a 404 page has no canonical', async () => {
  const result = await renderSeo(seoMeta({ output: '404.html', noindex: true }), undefined, '404.html', {
    notFound: true,
  })
  expect(result).not.toContain('rel="canonical"')
  expect(result).toContain('<meta name="robots" content="noindex, nofollow" />')
})
