import { test, expect, beforeEach, afterEach } from 'bun:test'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from './builder.js'
import type { BuilderConfig, PageRenderContext, RenderPlan } from './config.js'

const TEST_DIR = path.join(process.cwd(), '.test-hooks')
const CONTENT_DIR = path.join(TEST_DIR, 'content')
const OUTPUT_DIR = path.join(TEST_DIR, 'docs')
const TEMPLATE_PATH = path.join(TEST_DIR, 'template.html')
const HOMEPAGE_TEMPLATE_PATH = path.join(TEST_DIR, 'homepage.html')

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
  await mkdir(CONTENT_DIR, { recursive: true })
  await writeFile(
    TEMPLATE_PATH,
    '<html lang="{{LANG}}"><head><title>{{TITLE}}</title></head><body>{{LANGUAGE_SWITCHER}}{{BODY}}</body></html>',
  )
  await writeFile(
    HOMEPAGE_TEMPLATE_PATH,
    '<html lang="{{LANG}}"><head><title>{{TITLE}}</title></head><body class="home">{{BODY}}</body></html>',
  )
})

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

function config(overrides: Partial<BuilderConfig> = {}): BuilderConfig {
  return {
    contentDir: CONTENT_DIR,
    outputDir: OUTPUT_DIR,
    templatePath: TEMPLATE_PATH,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
    translations: { targetLanguages: [], defaultLang: 'en', supportedLangs: ['en', 'fr', 'nl'] },
    ...overrides,
  }
}

async function writeContent(relativePath: string, content: string): Promise<void> {
  const filePath = path.join(CONTENT_DIR, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content)
}

function readOutput(relativePath: string): Promise<string> {
  return readFile(path.join(OUTPUT_DIR, relativePath), 'utf-8')
}

test('onPageRendered - writes the hook output and sees every plan and translation group', async () => {
  await writeContent('about.md', '---\ntitle: About\n---\n# About')
  await writeContent('fr/about.md', '---\ntitle: À propos\ntranslationOf: about\n---\n# À propos')
  await writeContent('contact.md', '# Contact')

  const calls: { plan: RenderPlan; context: PageRenderContext }[] = []
  await build(
    config({
      onPageRendered: async (html, plan, context) => {
        calls.push({ plan, context })
        return html.replace('</body>', `<footer>${context.plans.length} pages</footer></body>`)
      },
    }),
  )

  expect(calls.map((call) => call.plan.relativeOutput).sort()).toEqual([
    'about.html',
    'contact.html',
    'fr/about.html',
  ])
  for (const { context } of calls) {
    expect(context.plans).toHaveLength(3)
    expect(context.groups.get('about')?.map((plan) => plan.relativeOutput).sort()).toEqual([
      'about.html',
      'fr/about.html',
    ])
  }
  expect(await readOutput('fr/about.html')).toContain('<footer>3 pages</footer>')
})

test('onPageRendered - an identity hook writes the same bytes as no hook', async () => {
  await writeContent('about.md', '# About\n\n[Contact](/contact)')
  await writeContent('fr/about.md', '---\ntranslationOf: about\n---\n# À propos')
  await writeContent('contact.md', '# Contact')

  await build(config())
  const withoutHook = await readOutput('about.html')
  await build(config({ onPageRendered: (html) => html }))

  expect(await readOutput('about.html')).toBe(withoutHook)
})

test('checkLinks - fails on a broken link the hook injects', async () => {
  await writeContent('index.md', '# Home')

  await expect(
    build(config({ onPageRendered: (html) => html.replace('</body>', '<a href="/missing">x</a></body>') })),
  ).rejects.toThrow('Broken internal links found:\n- /missing')
})

test('checkLinks - passes when the hook removes a broken link from the markdown', async () => {
  await writeContent('index.md', '# Home\n\n[Gone](/gone)')

  await build(config({ onPageRendered: (html) => html.replace('<a href="/gone">Gone</a>', '') }))

  expect(await readOutput('index.html')).not.toContain('/gone')
})

test('onPagesWritten - runs after every page is written and before checkLinks', async () => {
  await writeContent('index.md', '# Home')
  await writeContent('house-rules.md', '# House rules')
  await writeContent('fr/index.md', '# Accueil')

  const order: string[] = []
  await build(
    config({
      onPageRendered: (html, plan) => {
        order.push(`rendered ${plan.relativeOutput}`)
        return plan.meta.lang === 'fr'
          ? html.replace('</body>', '<a href="/fr/house-rules">Règles</a></body>')
          : html
      },
      onPagesWritten: async (plans, outputDir) => {
        order.push('pagesWritten')
        expect(outputDir).toBe(OUTPUT_DIR)
        for (const plan of plans) {
          await access(plan.outputPath)
        }
        await writeFile(path.join(outputDir, 'fr', 'house-rules.html'), '<meta http-equiv="refresh" content="0; url=/house-rules">')
      },
    }),
  )

  expect(order.at(-1)).toBe('pagesWritten')
  expect(order).toHaveLength(4)
  const sitemap = await readOutput('sitemap.xml')
  expect(sitemap).not.toContain('fr/house-rules')
})

test('onPagesWritten - still runs when the link check is skipped', async () => {
  await writeContent('index.md', '# Home')

  let ran = false
  await build(config({ skipLinkCheck: true, onPagesWritten: () => { ran = true } }))

  expect(ran).toBe(true)
})

test('build - gives localized index pages the homepage template', async () => {
  await writeContent('index.md', '# Home')
  await writeContent('fr/index.md', '---\ntranslationOf: index\n---\n# Accueil')
  await writeContent('nl/index.md', '---\ntranslationOf: index\n---\n# Welkom')
  await writeContent('fr/about.md', '# À propos')
  await writeContent('guides/index.md', '# Guides')

  await build(config({ homepageTemplatePath: HOMEPAGE_TEMPLATE_PATH }))

  expect(await readOutput('index.html')).toContain('<body class="home">')
  expect(await readOutput('fr/index.html')).toContain('<body class="home">')
  expect(await readOutput('nl/index.html')).toContain('<body class="home">')
  expect(await readOutput('fr/about.html')).not.toContain('<body class="home">')
  expect(await readOutput('guides/index.html')).not.toContain('<body class="home">')
})

test('build - passes custom front-matter keys through on plan.meta', async () => {
  await writeContent('index.md', '---\neyebrow: Welcome\n---\n# Home')

  const [plan] = await build(config())
  const eyebrow: string | boolean | undefined = plan?.meta.eyebrow

  expect(eyebrow).toBe('Welcome')
})

test('jsonLd and onPageRendered - receive the same alternates the hreflang tags use', async () => {
  await writeContent('about.md', '# About')
  await writeContent('fr/about.md', '---\ntranslationOf: about\n---\n# À propos')
  await writeContent('404.md', '# Not found')

  const seen = new Map<string, { jsonLd?: PageRenderContext; rendered?: PageRenderContext }>()
  await build(
    config({
      jsonLd: (plan, context) => {
        seen.set(plan.relativeOutput, { ...seen.get(plan.relativeOutput), jsonLd: context })
        return undefined
      },
      onPageRendered: (html, plan, context) => {
        seen.set(plan.relativeOutput, { ...seen.get(plan.relativeOutput), rendered: context })
        return html
      },
    }),
  )

  const fr = seen.get('fr/about.html')
  expect(fr?.rendered?.alternates).toEqual([
    { lang: 'en', href: 'https://example.com/about' },
    { lang: 'fr', href: 'https://example.com/fr/about' },
    { lang: 'x-default', href: 'https://example.com/about' },
  ])
  expect(fr?.jsonLd).toBe(fr?.rendered)
  const hreflangTags = [...(await readOutput('fr/about.html')).matchAll(/<link rel="alternate" href="([^"]+)" hreflang="([^"]+)"/g)]
    .map(([, href, lang]) => ({ lang, href }))
  expect(hreflangTags).toEqual(fr?.rendered?.alternates as { lang: string; href: string }[])
  expect(seen.get('404.html')?.rendered?.alternates).toEqual([])
})
