import { test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from './builder.js'

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
