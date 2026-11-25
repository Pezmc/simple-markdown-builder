import { test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from './builder.js'
import type { BuilderConfig, RedirectInfo } from './config.js'

const TEST_DIR = path.join(process.cwd(), '.test-builder')

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
  await mkdir(TEST_DIR, { recursive: true })
})

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

test('build - preserves directory structure from content directory', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')

  // Create content directory structure
  await mkdir(path.join(contentDir, 'house-rules'), { recursive: true })
  await writeFile(
    path.join(contentDir, 'house-rules', 'rope-jam.md'),
    `---
slug: rope-jam
title: Rope Jam Rules
---
# Rope Jam Rules
Content here
`,
  )

  // Create a simple template
  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
  <title>{{TITLE}}</title>
</head>
<body>{{BODY}}</body>
</html>`,
  )

  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
  }

  await build(config)

  // Verify the file was created in the correct directory structure
  const expectedPath = path.join(outputDir, 'house-rules', 'rope-jam.html')
  const exists = await readFile(expectedPath, 'utf-8').then(
    () => true,
    () => false,
  )

  expect(exists).toBe(true)
  const content = await readFile(expectedPath, 'utf-8')
  expect(content).toContain('Rope Jam Rules')
})

test('build - preserves directory structure with nested subdirectories', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')

  // Create nested directory structure
  await mkdir(path.join(contentDir, 'guides', 'advanced'), { recursive: true })
  await writeFile(
    path.join(contentDir, 'guides', 'advanced', 'techniques.md'),
    `---
slug: techniques
title: Advanced Techniques
---
# Advanced Techniques
Content here
`,
  )

  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html>
<head><title>{{TITLE}}</title></head>
<body>{{BODY}}</body>
</html>`,
  )

  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
  }

  await build(config)

  // Verify the file was created in the correct nested directory structure
  const expectedPath = path.join(outputDir, 'guides', 'advanced', 'techniques.html')
  const exists = await readFile(expectedPath, 'utf-8').then(
    () => true,
    () => false,
  )

  expect(exists).toBe(true)
})

test('build - does not preserve language directory structure', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')

  // Create language directory structure
  await mkdir(path.join(contentDir, 'fr'), { recursive: true })
  await writeFile(
    path.join(contentDir, 'fr', 'page.md'),
    `---
slug: page
title: Page FR
---
# Page FR
Content here
`,
  )

  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html>
<head><title>{{TITLE}}</title></head>
<body>{{BODY}}</body>
</html>`,
  )

  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
    translations: {
      apiKey: 'test',
      targetLanguages: ['fr'],
      defaultLang: 'en',
      supportedLangs: ['en', 'fr'],
    },
  }

  await build(config)

  // Language directories are treated specially - files go to the language subdirectory in output
  // The file should be at docs/fr/page.html (language dir is preserved in output)
  const expectedPath = path.join(outputDir, 'fr', 'page.html')
  const exists = await readFile(expectedPath, 'utf-8').then(
    () => true,
    () => false,
  )

  expect(exists).toBe(true)
})

test('build - preserves deeply nested directory structure (39c3/bla/egg.md -> 39c3/bla/egg.html)', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')

  // Create deeply nested directory structure: 39c3/bla/egg.md
  await mkdir(path.join(contentDir, '39c3', 'bla'), { recursive: true })
  await writeFile(
    path.join(contentDir, '39c3', 'bla', 'egg.md'),
    `---
slug: egg
title: Egg Page
---
# Egg Page
Content here
`,
  )

  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
  <title>{{TITLE}}</title>
</head>
<body>{{BODY}}</body>
</html>`,
  )

  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
  }

  await build(config)

  // Verify the file was created at 39c3/bla/egg.html
  const expectedPath = path.join(outputDir, '39c3', 'bla', 'egg.html')
  const exists = await readFile(expectedPath, 'utf-8').then(
    () => true,
    () => false,
  )

  expect(exists).toBe(true)
  const content = await readFile(expectedPath, 'utf-8')
  expect(content).toContain('Egg Page')
})

test('build - preserves directory structure for root level files', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')

  await mkdir(contentDir, { recursive: true })

  await writeFile(
    path.join(contentDir, 'index.md'),
    `---
slug: index
title: Home
---
# Home
Content here
`,
  )

  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html>
<head><title>{{TITLE}}</title></head>
<body>{{BODY}}</body>
</html>`,
  )

  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
  }

  await build(config)

  // Verify the file was created at root level
  const expectedPath = path.join(outputDir, 'index.html')
  const exists = await readFile(expectedPath, 'utf-8').then(
    () => true,
    () => false,
  )

  expect(exists).toBe(true)
})


test('build - rejects two pages whose slugs fold to the same output', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const templatePath = path.join(TEST_DIR, 'template.html')
  await mkdir(contentDir, { recursive: true })
  await writeFile(path.join(contentDir, 'résumé.md'), '# Résumé')
  await writeFile(path.join(contentDir, 'resume.md'), '# Resume')
  await writeFile(templatePath, '<html><body>{{BODY}}</body></html>')

  await expect(
    build({
      contentDir,
      outputDir: path.join(TEST_DIR, 'docs'),
      templatePath,
      baseUrl: 'https://example.com',
      defaultMeta: {
        title: 'Test Site',
        description: 'Test',
        sidebarTitle: 'Test',
        sidebarSummary: 'Test',
        backLinkHref: '/',
        backLinkLabel: 'Back',
      },
    }),
  ).rejects.toThrow('Duplicate output resume.html')
})

// SEO and 404 builds run outside this repository, so "no git" really means no git.
async function seoSite(files: Record<string, string>, template = SEO_BUILD_TEMPLATE) {
  const root = await mkdtemp(path.join(tmpdir(), 'smb-seo-'))
  const contentDir = path.join(root, 'content')
  const outputDir = path.join(root, 'docs')
  const templatePath = path.join(root, 'template.html')
  for (const [file, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(contentDir, file)), { recursive: true })
    await writeFile(path.join(contentDir, file), body)
  }
  await writeFile(templatePath, template)
  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Site',
      description: 'Site',
      sidebarTitle: 'Site',
      sidebarSummary: 'Site',
      backLinkHref: '/',
      backLinkLabel: 'Back',
      ogImage: '/og.png',
    },
  }
  const read = (file: string) => readFile(path.join(outputDir, file), 'utf-8')
  return { root, contentDir, outputDir, config, read }
}

const SEO_BUILD_TEMPLATE = `<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
  <title>{{TITLE}}</title>
</head>
<body>{{BODY}}<time datetime="{{UPDATED_ISO}}">{{UPDATED}}</time></body>
</html>`

const seoRoots: string[] = []
afterEach(async () => {
  await Promise.all(seoRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function git(cwd: string, args: string[], date?: string) {
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    stdio: 'ignore',
    // Isolated from the developer's git config (hooks, templates, default branch).
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...(date ? { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : {}) },
  })
}

function captureWarnings() {
  const spy = spyOn(console, 'warn')
  return {
    messages: () => spy.mock.calls.map((call) => String(call.join(' '))),
    restore: () => spy.mockRestore(),
  }
}

test('build - lastmod git dates pages from their last commit in one batch', async () => {
  const site = await seoSite({ 'about.md': '# About', 'über.md': '# Über', 'new.md': '# New' })
  seoRoots.push(site.root)
  git(site.root, ['init', '-q'])
  git(site.root, ['add', 'content/about.md', 'content/über.md'])
  git(site.root, ['commit', '-q', '-m', 'first'], '2026-01-05T12:00:00Z')
  await writeFile(path.join(site.contentDir, 'about.md'), '# About us')
  git(site.root, ['commit', '-q', '-am', 'second'], '2026-03-09T12:00:00Z')

  const plans = await build({ ...site.config, lastmod: 'git' as const })
  const byOutput = new Map(plans.map((plan) => [plan.relativeOutput, plan.meta.lastModified]))
  expect(byOutput.get('about.html')).toBe('2026-03-09')
  expect(byOutput.get('uber.html')).toBe('2026-01-05')
  expect(byOutput.get('new.html')).toBeUndefined()

  const sitemap = await site.read('sitemap.xml')
  expect(sitemap).toContain('<loc>https://example.com/about</loc>\n    <lastmod>2026-03-09</lastmod>')
  expect(await site.read('about.html')).toContain('<time datetime="2026-03-09">March 9, 2026</time>')
  expect(await site.read('new.html')).toContain('<time datetime=""></time>')
})

test('build - lastmod git outside a repository warns once and omits dates', async () => {
  const site = await seoSite({ 'a.md': '# A', 'b.md': '# B' })
  seoRoots.push(site.root)
  const warnings = captureWarnings()
  try {
    const plans = await build({ ...site.config, lastmod: 'git' as const })
    expect(plans.every((plan) => plan.meta.lastModified === undefined)).toBe(true)
    expect(warnings.messages().filter((m) => m.includes('lastmod:'))).toHaveLength(1)
  } finally {
    warnings.restore()
  }
  expect(await site.read('sitemap.xml')).not.toContain('<lastmod>')
})

test('build - lastmod git in a shallow clone warns and omits dates', async () => {
  const origin = await seoSite({ 'a.md': '# A' })
  seoRoots.push(origin.root)
  git(origin.root, ['init', '-q'])
  git(origin.root, ['add', '.'])
  git(origin.root, ['commit', '-q', '-m', 'one'], '2026-01-01T00:00:00Z')
  git(origin.root, ['commit', '-q', '--allow-empty', '-m', 'two'], '2026-01-02T00:00:00Z')
  const clone = path.join(origin.root, 'clone')
  git(origin.root, ['clone', '-q', '--depth', '1', `file://${origin.root}`, clone])

  const warnings = captureWarnings()
  try {
    const plans = await build({
      ...origin.config,
      contentDir: path.join(clone, 'content'),
      outputDir: path.join(clone, 'docs'),
      lastmod: 'git' as const,
    })
    expect(plans[0]!.meta.lastModified).toBeUndefined()
    expect(warnings.messages().some((m) => m.includes('shallow git clone'))).toBe(true)
  } finally {
    warnings.restore()
  }
})

test('build - jsonLd hook output is injected per page', async () => {
  const site = await seoSite({ 'a.md': '# A', 'b.md': '# B' })
  seoRoots.push(site.root)
  await build({
    ...site.config,
    jsonLd: (plan, { plans }) =>
      plan.relativeOutput === 'a.html'
        ? { '@type': 'WebPage', name: plan.meta.title, pages: plans.length }
        : undefined,
  })
  expect(await site.read('a.html')).toContain(
    '<script type="application/ld+json">{"@type":"WebPage","name":"Site","pages":2}</script>',
  )
  expect(await site.read('b.html')).not.toContain('application/ld+json')
})

test('build - robots writes robots.txt and regenerates its own file', async () => {
  const site = await seoSite({ 'index.md': '# Home', 'secret.md': '---\nnoindex: true\n---\n# Secret' })
  seoRoots.push(site.root)
  const config = { ...site.config, robots: { disallow: ['/drafts/'] } }
  await build(config)
  await build(config)
  const robots = await site.read('robots.txt')
  // noindex pages stay crawlable so crawlers can see their noindex tag.
  expect(robots).toContain('Allow: /\nDisallow: /drafts/\n')
  expect(robots).not.toContain('secret')
  expect(robots).toContain('Sitemap: https://example.com/sitemap.xml')
})

test('build - robots refuses to overwrite a hand-written robots.txt', async () => {
  const site = await seoSite({ 'index.md': '# Home' })
  seoRoots.push(site.root)
  await mkdir(site.outputDir, { recursive: true })
  await writeFile(path.join(site.outputDir, 'robots.txt'), 'User-agent: *\nDisallow:\n')
  await expect(build({ ...site.config, robots: true })).rejects.toThrow('was not generated by simple-markdown-builder')
  expect(await site.read('robots.txt')).toBe('User-agent: *\nDisallow:\n')
  await build(site.config)
  expect(await site.read('robots.txt')).toBe('User-agent: *\nDisallow:\n')
})

test('build - robots refuses before clean deletes any HTML', async () => {
  const site = await seoSite({ 'index.md': '# Home' })
  seoRoots.push(site.root)
  await mkdir(site.outputDir, { recursive: true })
  await writeFile(path.join(site.outputDir, 'robots.txt'), 'User-agent: *\n')
  await writeFile(path.join(site.outputDir, 'old.html'), '<p>published</p>')
  await expect(build({ ...site.config, robots: true, clean: true })).rejects.toThrow('was not generated')
  expect(await site.read('old.html')).toBe('<p>published</p>')
})

test('build - robots refuses a hand-written robots.txt copied in by onPagesWritten', async () => {
  const site = await seoSite({ 'index.md': '# Home' })
  seoRoots.push(site.root)
  await expect(
    build({
      ...site.config,
      robots: true,
      onPagesWritten: (_plans, outputDir) => writeFile(path.join(outputDir, 'robots.txt'), 'User-agent: *\n'),
    }),
  ).rejects.toThrow('was not generated')
  expect(await site.read('robots.txt')).toBe('User-agent: *\n')
})

test('build - 404 pages are noindex, uncanonical and out of the sitemap and hreflang', async () => {
  const site = await seoSite({
    'index.md': '# Home',
    '404.md': '# Not found\n\n[Home](/)',
    'fr/404.md': '---\ntranslationOf: 404\n---\n# Introuvable',
  })
  seoRoots.push(site.root)
  await build({
    ...site.config,
    translations: { targetLanguages: [], defaultLang: 'en', supportedLangs: ['en', 'fr'] },
  })
  for (const file of ['404.html', 'fr/404.html']) {
    const html = await site.read(file)
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />')
    expect(html).not.toContain('rel="canonical"')
    expect(html).not.toContain('hreflang=')
  }
  expect(await site.read('index.html')).toContain('rel="canonical"')
  const sitemap = await site.read('sitemap.xml')
  expect(sitemap).not.toContain('404')
  expect(sitemap).toContain('<loc>https://example.com/</loc>')
})

test('build - warns about relative URLs on the 404 page, template included', async () => {
  const site = await seoSite(
    { 'index.md': '# Home', 'about.md': '# About', '404.md': '# Missing\n\n[About](about)' },
    SEO_BUILD_TEMPLATE.replace('</head>', '<link rel="stylesheet" href="style.css">\n</head>'),
  )
  seoRoots.push(site.root)
  await mkdir(site.outputDir, { recursive: true })
  await writeFile(path.join(site.outputDir, 'style.css'), '')
  const warnings = captureWarnings()
  try {
    await build(site.config)
    const relative = warnings.messages().filter((m) => m.includes('relative URLs'))
    expect(relative).toHaveLength(1)
    expect(relative[0]).toContain('404.html')
    expect(relative[0]).toContain('style.css, about')
  } finally {
    warnings.restore()
  }
})

test('build - link check still covers the 404 page', async () => {
  const site = await seoSite({ 'index.md': '# Home', '404.md': '# Missing\n\n[Gone](/gone)' })
  seoRoots.push(site.root)
  await expect(build(site.config)).rejects.toThrow('/gone')
})

test('build - a front-matter lastModified key is ignored', async () => {
  const site = await seoSite({ 'a.md': '---\nlastModified: last week\n---\n# A' })
  seoRoots.push(site.root)
  const plans = await build(site.config)
  expect(plans[0]!.meta.lastModified).toBeUndefined()
  expect(await site.read('sitemap.xml')).not.toContain('<lastmod>')
})

test('build - a page sharing the 404 group key gets no 404 alternate', async () => {
  const site = await seoSite({
    '404.md': '# Missing',
    'fr/404.md': '---\ntranslationOf: 404\n---\n# Introuvable',
    'docs/404.md': '# Error code 404',
  })
  seoRoots.push(site.root)
  await build({
    ...site.config,
    translations: { targetLanguages: [], defaultLang: 'en', supportedLangs: ['en', 'fr'] },
  })
  const html = await site.read('docs/404.html')
  expect(html).toContain('<link rel="canonical" href="https://example.com/docs/404" />')
  expect(html).not.toContain('href="https://example.com/404"')
  expect(html).not.toContain('/fr/404')
  expect(await site.read('sitemap.xml')).toContain('<loc>https://example.com/docs/404</loc>')
})

test('build - pairs nested index pages and repeated filenames with their own translations', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')
  const pages: Record<string, string> = {
    'index.md': '# Home',
    'classes/index.md': '# Classes',
    'classes/beginner.md': '# Beginner class',
    'workshops/beginner.md': '# Beginner workshop',
    'fr/index.md': '---\ntranslationOf: index\n---\n# Accueil',
    'fr/classes/index.md': '---\ntranslationOf: index\n---\n# Cours',
    'fr/classes/beginner.md': '---\nslug: debutant\ntranslationOf: beginner\n---\n# Cours débutant',
  }
  for (const [file, body] of Object.entries(pages)) {
    await mkdir(path.dirname(path.join(contentDir, file)), { recursive: true })
    await writeFile(path.join(contentDir, file), body)
  }
  await writeFile(templatePath, '<html><head><title>{{TITLE}}</title></head><body>{{BODY}}</body></html>')

  await build({
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    skipLinkCheck: true,
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
    translations: { targetLanguages: [], defaultLang: 'en', supportedLangs: ['en', 'fr'] },
  })

  const read = (file: string) => readFile(path.join(outputDir, file), 'utf-8')
  const alternates = (html: string) =>
    [...html.matchAll(/<link rel="alternate" href="([^"]+)" hreflang="([^"]+)"/g)].map(
      ([, href, lang]) => `${lang} ${href}`,
    )

  const home = await read('index.html')
  expect(alternates(home)).toEqual([
    'en https://example.com/',
    'fr https://example.com/fr/',
    'x-default https://example.com/',
  ])
  expect(home).toContain('<link rel="canonical" href="https://example.com/" />')

  const classes = await read('classes/index.html')
  expect(alternates(classes)).toEqual([
    'en https://example.com/classes/',
    'fr https://example.com/fr/classes/',
    'x-default https://example.com/classes/',
  ])
  expect(classes).toContain('<link rel="canonical" href="https://example.com/classes/" />')

  const workshop = await read('workshops/beginner.html')
  expect(alternates(workshop)).toEqual([
    'en https://example.com/workshops/beginner',
    'x-default https://example.com/workshops/beginner',
  ])
  expect(workshop).toContain('<link rel="canonical" href="https://example.com/workshops/beginner" />')

  const frBeginner = await read('fr/classes/debutant.html')
  expect(alternates(frBeginner)).toEqual([
    'en https://example.com/classes/beginner',
    'fr https://example.com/fr/classes/debutant',
    'x-default https://example.com/classes/beginner',
  ])
  expect(frBeginner).toContain('<link rel="canonical" href="https://example.com/fr/classes/debutant" />')

  const sitemap = await read('sitemap.xml')
  const entry = (loc: string) =>
    sitemap.split('<url>').find((row) => row.includes(`<loc>${loc}</loc>`)) ?? ''
  expect(entry('https://example.com/')).not.toContain('classes')
  expect(entry('https://example.com/classes/beginner')).toContain(
    'hreflang="fr" href="https://example.com/fr/classes/debutant"',
  )
  expect(entry('https://example.com/workshops/beginner')).not.toContain('hreflang="fr"')
})

const DEFAULT_META = {
  title: 'Test Site',
  description: 'Test',
  sidebarTitle: 'Test',
  sidebarSummary: 'Test',
  backLinkHref: '/',
  backLinkLabel: 'Back',
}

async function redirectSite(
  files: Record<string, string>,
  overrides: Partial<BuilderConfig> = {},
): Promise<BuilderConfig> {
  const contentDir = path.join(TEST_DIR, 'content')
  const templatePath = path.join(TEST_DIR, 'template.html')
  for (const [name, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(contentDir, name)), { recursive: true })
    await writeFile(path.join(contentDir, name), body)
  }
  await writeFile(templatePath, '<html><head><title>{{TITLE}}</title></head><body>{{BODY}}</body></html>')
  return {
    contentDir,
    outputDir: path.join(TEST_DIR, 'docs'),
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: DEFAULT_META,
    ...overrides,
  }
}

const TRANSLATIONS = {
  targetLanguages: [],
  defaultLang: 'en',
  supportedLangs: ['en', 'fr', 'nl'],
} as const

test('build - writes a redirect stub with refresh, canonical, noindex and a visible link', async () => {
  const config = await redirectSite(
    { 'new-page.md': '# New' },
    { redirects: [{ from: '/old-page', to: '/new-page' }] },
  )
  const plans = await build(config)

  const stub = await readFile(path.join(TEST_DIR, 'docs', 'old-page.html'), 'utf-8')
  expect(stub).toContain('<meta http-equiv="refresh" content="0; url=/new-page" />')
  expect(stub).toContain('<link rel="canonical" href="https://example.com/new-page" />')
  expect(stub).toContain('<meta name="robots" content="noindex, follow" />')
  expect(stub).toContain('<a href="/new-page">')
  expect(stub).toContain('<html lang="en">')
  expect(plans.map((plan) => plan.relativeOutput)).toEqual(['new-page.html'])
})

test('build - redirects to an external URL', async () => {
  const config = await redirectSite(
    { 'index.md': '# Home' },
    { redirects: [{ from: 'shop/', to: 'https://shop.example.com/?a=1&b=2' }] },
  )
  await build(config)

  const stub = await readFile(path.join(TEST_DIR, 'docs', 'shop', 'index.html'), 'utf-8')
  expect(stub).toContain('url=https://shop.example.com/?a=1&amp;b=2')
  expect(stub).toContain('<link rel="canonical" href="https://shop.example.com/?a=1&amp;b=2" />')
})

test('build - rejects a redirect whose from is a real page', async () => {
  const config = await redirectSite(
    { 'about.md': '# About', 'team.md': '# Team' },
    { redirects: [{ from: '/about', to: '/team' }] },
  )
  await expect(build(config)).rejects.toThrow('Redirect from /about collides with the page about.html')
})

test('build - rejects two redirects from the same path', async () => {
  const config = await redirectSite(
    { 'about.md': '# About', 'team.md': '# Team' },
    {
      redirects: [
        { from: '/old', to: '/about' },
        { from: 'old.html', to: '/team' },
      ],
    },
  )
  await expect(build(config)).rejects.toThrow('Redirect from /old is declared twice')
})

test('build - rejects a redirect to a page that is not built', async () => {
  const config = await redirectSite(
    { 'about.md': '# About' },
    { redirects: [{ from: '/old', to: '/missing' }] },
  )
  await expect(build(config)).rejects.toThrow('Redirect from /old points to /missing, which is not a built page')
})

test('build - rejects a redirect from a path outside the output directory', async () => {
  const config = await redirectSite(
    { 'about.md': '# About' },
    { redirects: [{ from: '../escape', to: '/about' }] },
  )
  await expect(build(config)).rejects.toThrow('must not contain . or .. segments')
})

test('build - link-checks redirect stubs', async () => {
  const config = await redirectSite(
    { 'about.md': '# About' },
    { redirects: [{ from: '/old', to: '/about#no-such-heading' }] },
  )
  await expect(build(config)).rejects.toThrow('/about#no-such-heading from')
})

test('build - pages may link to a redirect stub', async () => {
  const config = await redirectSite(
    { 'index.md': '[Old](/old#about)', 'about.md': '# About' },
    { redirects: [{ from: '/old', to: '/about' }] },
  )
  await build(config)
})

test('build - translationFallback writes a stub per missing language', async () => {
  const config = await redirectSite(
    {
      'about.md': '# About',
      'fr/about.md': '---\ntranslationOf: about\n---\n# À propos',
      'rules.md': '# Rules',
    },
    { translations: TRANSLATIONS, translationFallback: 'redirect' },
  )
  await build(config)

  const docs = path.join(TEST_DIR, 'docs')
  const nlAbout = await readFile(path.join(docs, 'nl', 'about.html'), 'utf-8')
  expect(nlAbout).toContain('url=/about')
  expect(nlAbout).toContain('<html lang="nl">')
  expect(await readFile(path.join(docs, 'fr', 'rules.html'), 'utf-8')).toContain('url=/rules')
  expect(await readFile(path.join(docs, 'nl', 'rules.html'), 'utf-8')).toContain('url=/rules')
  // The real translation is kept.
  expect(await readFile(path.join(docs, 'fr', 'about.html'), 'utf-8')).toContain('À propos')
})

test('build - translationFallback covers each default-language page in a slug group', async () => {
  const config = await redirectSite(
    { 'index.md': '# Home', 'guides/index.md': '# Guides' },
    {
      translations: { ...TRANSLATIONS, supportedLangs: ['en', 'fr'] },
      translationFallback: 'redirect',
    },
  )
  await build(config)

  const docs = path.join(TEST_DIR, 'docs')
  expect(await readFile(path.join(docs, 'fr', 'index.html'), 'utf-8')).toContain('url=/"')
  expect(await readFile(path.join(docs, 'fr', 'guides', 'index.html'), 'utf-8')).toContain('url=/guides/')
})

test('build - translationFallback fails when a fallback path is a real page of another group', async () => {
  const config = await redirectSite(
    { 'about.md': '# About', 'fr/about.md': '---\ntranslationOf: something-else\n---\n# À propos' },
    {
      translations: { ...TRANSLATIONS, supportedLangs: ['en', 'fr'] },
      translationFallback: 'redirect',
    },
  )
  await expect(build(config)).rejects.toThrow('Redirect from /fr/about collides with the page fr/about.html')
})

test('build - translationFallback fails when it collides with an explicit redirect', async () => {
  const config = await redirectSite(
    { 'about.md': '# About' },
    {
      translations: { ...TRANSLATIONS, supportedLangs: ['en', 'fr'] },
      translationFallback: 'redirect',
      redirects: [{ from: '/fr/about', to: '/about' }],
    },
  )
  await expect(build(config)).rejects.toThrow('Redirect from /fr/about is declared twice')
})

test('build - renderRedirect replaces the stub HTML', async () => {
  const seen: RedirectInfo[] = []
  const config = await redirectSite(
    { 'about.md': '# About', 'new.md': '# New' },
    {
      translations: { ...TRANSLATIONS, supportedLangs: ['en', 'fr'] },
      translationFallback: 'redirect',
      redirects: [{ from: '/fr/old', to: '/new' }],
      renderRedirect: (info) => {
        seen.push(info)
        return `<p lang="${info.lang}">${info.reason}: <a href="${info.to}">go</a></p>`
      },
    },
  )
  await build(config)

  expect(await readFile(path.join(TEST_DIR, 'docs', 'fr', 'about.html'), 'utf-8')).toBe(
    '<p lang="fr">untranslated: <a href="/about">go</a></p>',
  )
  expect(seen).toContainEqual({ from: '/fr/old', to: '/new', lang: 'fr', reason: 'moved' })
  expect(seen).toContainEqual({ from: '/fr/about', to: '/about', lang: 'fr', reason: 'untranslated' })
})

test('build - linkCheck.translationSiblings fails a template without the language switcher', async () => {
  const config = await redirectSite(
    { 'about.md': '# About', 'fr/about.md': '---\ntranslationOf: about\n---\n# À propos' },
    {
      translations: { ...TRANSLATIONS, supportedLangs: ['en', 'fr'] },
      linkCheck: { translationSiblings: true },
    },
  )
  await expect(build(config)).rejects.toThrow('Translated pages missing a link to a sibling translation')

  await writeFile(
    config.templatePath,
    '<html><head><title>{{TITLE}}</title></head><body>{{LANGUAGE_SWITCHER}}{{BODY}}</body></html>',
  )
  await build(config)
})

test('build - rejects protocol-relative and non-http redirect targets', async () => {
  for (const to of ['//shop.example.com', 'javascript:alert(1)', 'about']) {
    const config = await redirectSite({ 'about.md': '# About' }, { redirects: [{ from: '/old', to }] })
    await expect(build(config)).rejects.toThrow(`Redirect to "${to}" must be a site path starting with / or an http(s) URL`)
  }
})

test('build - translationFallback decides per page when default-language pages share a slug', async () => {
  const config = await redirectSite(
    { 'index.md': '# Home', 'guides/index.md': '# Guides', 'fr/index.md': '# Accueil' },
    {
      translations: { ...TRANSLATIONS, supportedLangs: ['en', 'fr'] },
      translationFallback: 'redirect',
    },
  )
  await build(config)

  const docs = path.join(TEST_DIR, 'docs')
  expect(await readFile(path.join(docs, 'fr', 'index.html'), 'utf-8')).toContain('Accueil')
  expect(await readFile(path.join(docs, 'fr', 'guides', 'index.html'), 'utf-8')).toContain('url=/guides/')
})
