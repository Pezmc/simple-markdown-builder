import { test, expect, beforeEach, afterEach, setSystemTime } from 'bun:test'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  escapeHtml,
  toAbsoluteUrl,
  cleanUrl,
  renderTemplate,
  clearTemplateCache,
  getTemplateFiles,
  toPlaceholderName,
} from './template.js'
import type { PageMeta, iAlternateLink } from './config.js'

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
  clearTemplateCache()
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

// expected.html was rendered from template.html by the v3.1 template code.
test('renderTemplate - a template without the v3.2 features renders byte-for-byte as in v3.1', async () => {
  const fixtures = path.join(import.meta.dir, '../test/fixtures/legacy-template')
  const meta: PageMeta = {
    title: 'A <Title> & "more"',
    description: "It's described",
    sidebarTitle: 'Side',
    sidebarSummary: 'Summary',
    backLinkHref: '/back?a=1&b=2',
    backLinkLabel: 'Back',
    output: 'fr/page.html',
    lang: 'fr',
    ogImage: 'img/og.png',
    lastModified: '2026-11-01',
    eyebrow: 'Unused eyebrow',
  }
  const alternates: iAlternateLink[] = [
    { lang: 'en', href: 'https://example.com/page' },
    { lang: 'fr', href: 'https://example.com/fr/page' },
    { lang: 'x-default', href: 'https://example.com/page' },
  ]
  setSystemTime(new Date('2026-06-01T12:00:00Z'))
  try {
    const result = await renderTemplate(
      '<p>{{TITLE}} {{#EYEBROW}}x{{/EYEBROW}} {{> partials/head.html}} {{EYEBROW}}</p>',
      meta,
      path.join(fixtures, 'template.html'),
      'https://example.com',
      false,
      undefined,
      alternates,
      undefined,
      { jsonLd: { '@type': 'WebPage', name: '</script>' } },
    )
    expect(result).toBe(await readFile(path.join(fixtures, 'expected.html'), 'utf-8'))
  } finally {
    setSystemTime()
  }
})

function featureMeta(overrides: Partial<PageMeta> = {}): PageMeta {
  return {
    title: 'Title',
    description: 'Description',
    sidebarTitle: 'Side',
    sidebarSummary: 'Summary',
    backLinkHref: '/',
    backLinkLabel: 'Back',
    output: 'page.html',
    ogImage: 'og.png',
    ...overrides,
  }
}

async function renderFeature(
  template: string,
  meta: PageMeta = featureMeta(),
  body = '<p>body</p>',
  alternates?: iAlternateLink[],
): Promise<string> {
  const templatePath = path.join(TEST_TEMPLATE_DIR, 'feature.html')
  await writeFile(templatePath, `<html><head></head><body>${template}</body></html>`)
  const result = await renderTemplate(body, meta, templatePath, 'https://example.com', false, undefined, alternates)
  return result.slice(result.indexOf('<body>') + 6, result.indexOf('</body>'))
}

test('toPlaceholderName - maps keys to upper snake case', () => {
  expect(toPlaceholderName('eyebrow')).toBe('EYEBROW')
  expect(toPlaceholderName('heroImage')).toBe('HERO_IMAGE')
  expect(toPlaceholderName('ogImageWidth')).toBe('OG_IMAGE_WIDTH')
  expect(toPlaceholderName('hero-image')).toBe('HERO_IMAGE')
  expect(toPlaceholderName('2col')).toBeUndefined()
})

test('renderTemplate - front-matter keys fill escaped placeholders', async () => {
  const result = await renderFeature(
    '<p>{{EYEBROW}}</p><img src="{{HERO_IMAGE}}">',
    featureMeta({ eyebrow: 'Rope & <knots>', heroImage: 'img/a"b.png' }),
  )
  expect(result).toBe('<p>Rope &amp; &lt;knots&gt;</p><img src="img/a&quot;b.png">')
})

test('renderTemplate - an unset front-matter placeholder renders empty', async () => {
  expect(await renderFeature('[{{EYEBROW}}]')).toBe('[]')
})

test('renderTemplate - built-ins win over front-matter keys of the same name', async () => {
  const result = await renderFeature(
    '{{BODY}}|{{YEAR}}|{{LANG}}',
    featureMeta({ body: 'not the body', year: '1999' }),
  )
  expect(result).toBe(`<p>body</p>|${new Date().getFullYear()}|en`)
})

test('renderTemplate - only all-caps double-brace tokens are placeholders', async () => {
  const result = await renderFeature(
    '{{eyebrow}} {{ EYEBROW }} {{Eyebrow}} {{1A}} {{_A}} {{EYEBROW}}',
    featureMeta({ eyebrow: 'E' }),
  )
  expect(result).toBe('{{eyebrow}} {{ EYEBROW }} {{Eyebrow}} {{1A}} {{_A}} E')
})

test('renderTemplate - booleans fill placeholders as true or empty', async () => {
  const result = await renderFeature('{{FEATURED}}|{{HIDDEN}}', featureMeta({ featured: true, hidden: false }))
  expect(result).toBe('true|')
})

test('renderTemplate - nothing is expanded inside the body or inserted values', async () => {
  const body = '<p>{{TITLE}} {{#EYEBROW}}x{{/EYEBROW}} {{/X}} {{> head.html}} $$ $& {{EYEBROW}}</p>'
  const result = await renderFeature(
    '{{BODY}}|{{DESCRIPTION}}',
    featureMeta({ eyebrow: 'E', description: '{{TITLE}} $$' }),
    body,
  )
  expect(result).toBe(`${body}|{{TITLE}} $$`)
})

test('renderTemplate - a section keeps its contents when the value is non-empty', async () => {
  const template = '<p>{{#EYEBROW}}<span class="eyebrow">{{EYEBROW}}</span>{{/EYEBROW}}</p>'
  expect(await renderFeature(template, featureMeta({ eyebrow: 'Hi' }))).toBe(
    '<p><span class="eyebrow">Hi</span></p>',
  )
  expect(await renderFeature(template, featureMeta({ eyebrow: '' }))).toBe('<p></p>')
  expect(await renderFeature(template)).toBe('<p></p>')
})

test('renderTemplate - {{#UPDATED}} drops the Updated line without a date', async () => {
  const template = `<footer>
  {{#UPDATED}}
  <span>Updated <time datetime="{{UPDATED_ISO}}">{{UPDATED}}</time></span>
  {{/UPDATED}}
</footer>`
  expect(await renderFeature(template, featureMeta({ lastModified: '2026-11-01' }))).toBe(`<footer>
  
  <span>Updated <time datetime="2026-11-01">November 1, 2026</time></span>
  
</footer>`)
  expect(await renderFeature(template)).toBe('<footer>\n  \n</footer>')
})

test('renderTemplate - {{#LANGUAGE_SWITCHER}} renders only with translations', async () => {
  const template = '{{#LANGUAGE_SWITCHER}}<div>{{LANGUAGE_SWITCHER}}</div>{{/LANGUAGE_SWITCHER}}'
  const alternates = [
    { lang: 'en', href: 'https://example.com/page' },
    { lang: 'fr', href: 'https://example.com/fr/page' },
  ]
  expect(await renderFeature(template, featureMeta(), undefined, alternates)).toContain('<div><nav class="smb-lang-switch"')
  expect(await renderFeature(template, featureMeta(), undefined, alternates.slice(0, 1))).toBe('')
})

test('renderTemplate - sections nest with differently named sections', async () => {
  const template = '{{#A}}a{{#B}}b{{B}}{{/B}}{{#C}}c{{/C}}{{/A}}|{{#C}}{{#A}}x{{/A}}{{/C}}'
  expect(await renderFeature(template, featureMeta({ a: '1', b: '2' }))).toBe('ab2|')
  expect(await renderFeature(template, featureMeta({ b: '2', c: '3' }))).toBe('|')
  expect(await renderFeature(template, featureMeta({ a: '1', c: '3' }))).toBe('ac|x')
})

test('renderTemplate - an unclosed section fails with the template and name', async () => {
  await expect(renderFeature('{{#EYEBROW}}open')).rejects.toThrow(/feature\.html never closes section EYEBROW/)
})

test('renderTemplate - a mismatched section fails with the template and name', async () => {
  await expect(renderFeature('{{#A}}{{#B}}{{/A}}{{/B}}')).rejects.toThrow(
    /feature\.html closes section A while section B is open/,
  )
  clearTemplateCache()
  await expect(renderFeature('{{/A}}')).rejects.toThrow(/feature\.html closes section A that was never opened/)
})

test('renderTemplate - includes resolve relative to the including file and nest', async () => {
  await mkdir(path.join(TEST_TEMPLATE_DIR, 'partials', 'meta'), { recursive: true })
  await writeFile(
    path.join(TEST_TEMPLATE_DIR, 'partials', 'head.html'),
    '<title>{{TITLE}}</title>{{>meta/icons.html}}',
  )
  await writeFile(
    path.join(TEST_TEMPLATE_DIR, 'partials', 'meta', 'icons.html'),
    '{{#EYEBROW}}<meta name="eyebrow" content="{{EYEBROW}}">{{/EYEBROW}}',
  )
  const templatePath = path.join(TEST_TEMPLATE_DIR, 'page.html')
  await writeFile(templatePath, '<html><head>{{> partials/head.html}}</head><body>{{BODY}}</body></html>')

  const result = await renderTemplate('<p>b</p>', featureMeta({ eyebrow: 'E' }), templatePath, 'https://example.com')
  expect(result).toStartWith('<html><head><title>Title</title><meta name="eyebrow" content="E">')
  expect(getTemplateFiles()).toEqual(
    expect.arrayContaining([
      templatePath,
      path.join(TEST_TEMPLATE_DIR, 'partials', 'head.html'),
      path.join(TEST_TEMPLATE_DIR, 'partials', 'meta', 'icons.html'),
    ]),
  )
})

test('renderTemplate - partials are cached until the cache is cleared', async () => {
  const partial = path.join(TEST_TEMPLATE_DIR, 'part.html')
  await writeFile(partial, 'one')
  expect(await renderFeature('{{> part.html}}')).toBe('one')
  await writeFile(partial, 'two')
  const templatePath = path.join(TEST_TEMPLATE_DIR, 'feature.html')
  const again = await renderTemplate('', featureMeta(), templatePath, 'https://example.com')
  expect(again).toContain('<body>one</body>')
  clearTemplateCache()
  expect(await renderFeature('{{> part.html}}')).toBe('two')
})

test('renderTemplate - a missing include fails naming the chain', async () => {
  await writeFile(path.join(TEST_TEMPLATE_DIR, 'outer.html'), '{{> missing.html}}')
  await expect(renderFeature('{{> outer.html}}')).rejects.toThrow(
    /Template include not found: .*feature\.html -> .*outer\.html -> .*missing\.html/,
  )
})

test('renderTemplate - an include cycle fails naming the chain', async () => {
  await writeFile(path.join(TEST_TEMPLATE_DIR, 'a.html'), '{{> b.html}}')
  await writeFile(path.join(TEST_TEMPLATE_DIR, 'b.html'), '{{> a.html}}')
  await expect(renderFeature('{{> a.html}}')).rejects.toThrow(
    /Template include cycle: .*feature\.html -> .*a\.html -> .*b\.html -> .*a\.html/,
  )
})

// Value: protects=several includes in one file land in source order, and a partial reached by two branches is not a cycle; fails_when=include results are spliced out of order or cycle detection uses a global visited set; why_new=existing include tests have one include per file and no diamond; seam=none; no_claim=performance of repeated partial reads
test('renderTemplate - sibling includes keep their order and a shared partial is not a cycle', async () => {
  await writeFile(path.join(TEST_TEMPLATE_DIR, 'shared.html'), '[s]')
  await writeFile(path.join(TEST_TEMPLATE_DIR, 'left.html'), 'L{{> shared.html}}')
  await writeFile(path.join(TEST_TEMPLATE_DIR, 'right.html'), 'R{{> shared.html}}')
  expect(await renderFeature('{{> left.html}}|{{> right.html}}|{{> left.html}}')).toBe('L[s]|R[s]|L[s]')
})

// Value: protects=a missing partial stays in getTemplateFiles so the dev server rebuilds once it is created; fails_when=files are recorded only after a successful read, or clearTemplateCache stops resetting them; why_new=getTemplateFiles is only checked after a successful render; seam=none; no_claim=chokidar actually firing on the new file
test('getTemplateFiles - records a missing partial and resets on clearTemplateCache', async () => {
  const missing = path.join(TEST_TEMPLATE_DIR, 'later.html')
  await expect(renderFeature('{{> later.html}}')).rejects.toThrow(/Template include not found/)
  expect(getTemplateFiles()).toEqual(
    expect.arrayContaining([path.join(TEST_TEMPLATE_DIR, 'feature.html'), missing]),
  )
  clearTemplateCache()
  expect(getTemplateFiles()).toEqual([])
  await writeFile(missing, 'now here')
  expect(await renderFeature('{{> later.html}}')).toBe('now here')
})
