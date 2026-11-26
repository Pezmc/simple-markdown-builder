import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { checkLinks } from './link-checker.js'
import { createMarkdownRenderer } from './markdown.js'
import type { RenderPlan } from './config.js'

const TEST_DIR = path.join(process.cwd(), '.test-link-checker')

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
  await mkdir(TEST_DIR, { recursive: true })
})

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

test('checkLinks - passes when anchor links match normalized IDs', async () => {
  const htmlFile = path.join(TEST_DIR, 'index.html')
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <h2 id="email-us">Get in touch</h2>
        <a href="#email-us">Email Us</a>
        <a href="#email-us">Contact</a>
      </body>
    </html>
  `
  await writeFile(htmlFile, html)

  await checkLinks(TEST_DIR)
})

test('checkLinks - passes when anchor links match IDs with different casing', async () => {
  const htmlFile = path.join(TEST_DIR, 'index.html')
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <h2 id="Email-Us">Get in touch</h2>
        <a href="#email-us">Email Us</a>
      </body>
    </html>
  `
  await writeFile(htmlFile, html)

  await checkLinks(TEST_DIR)
})

test('checkLinks - passes when an ASCII anchor targets a rendered accented heading', async () => {
  const htmlFile = path.join(TEST_DIR, 'index.html')
  const body = createMarkdownRenderer().render('## Leçons\n\n[Leçons](#lecons)')
  expect(body).toContain('id="lecons"')
  await writeFile(htmlFile, `<!DOCTYPE html><html><body>${body}</body></html>`)

  await checkLinks(TEST_DIR)
})

test('checkLinks - passes when internal links resolve to .html files', async () => {
  const indexFile = path.join(TEST_DIR, 'index.html')
  const targetDir = path.join(TEST_DIR, 'house-rules')
  const targetFile = path.join(targetDir, 'rope-jam.html')

  await mkdir(targetDir, { recursive: true })

  const indexHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <a href="/house-rules/rope-jam">Rope Jam Rules</a>
      </body>
    </html>
  `
  const targetHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <h1>Rope Jam Rules</h1>
      </body>
    </html>
  `

  await writeFile(indexFile, indexHtml)
  await writeFile(targetFile, targetHtml)

  await checkLinks(TEST_DIR)
})

test('checkLinks - passes when internal links with anchors resolve correctly', async () => {
  const indexFile = path.join(TEST_DIR, 'index.html')
  const targetFile = path.join(TEST_DIR, 'page.html')

  const indexHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <a href="/page#section">Go to section</a>
      </body>
    </html>
  `
  const targetHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <h2 id="section">Section Title</h2>
      </body>
    </html>
  `

  await writeFile(indexFile, indexHtml)
  await writeFile(targetFile, targetHtml)

  await checkLinks(TEST_DIR)
})

test('checkLinks - fails when anchor link does not exist', async () => {
  const htmlFile = path.join(TEST_DIR, 'index.html')
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <a href="#missing-anchor">Link</a>
      </body>
    </html>
  `
  await writeFile(htmlFile, html)

  try {
    await checkLinks(TEST_DIR)
    expect(false).toBe(true) // Should have thrown
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('Broken internal links found')
  }
})

test('checkLinks - fails when internal link does not exist', async () => {
  const htmlFile = path.join(TEST_DIR, 'index.html')
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <a href="/missing-page">Link</a>
      </body>
    </html>
  `
  await writeFile(htmlFile, html)

  try {
    await checkLinks(TEST_DIR)
    expect(false).toBe(true) // Should have thrown
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('Broken internal links found')
  }
})

test('checkLinks - fails when internal link with anchor has missing anchor', async () => {
  const indexFile = path.join(TEST_DIR, 'index.html')
  const targetFile = path.join(TEST_DIR, 'page.html')

  const indexHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <a href="/page#missing-section">Go to section</a>
      </body>
    </html>
  `
  const targetHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <h1>Page Title</h1>
      </body>
    </html>
  `

  await writeFile(indexFile, indexHtml)
  await writeFile(targetFile, targetHtml)

  try {
    await checkLinks(TEST_DIR)
    expect(false).toBe(true) // Should have thrown
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('Broken internal links found')
  }
})

test('checkLinks - skips external links', async () => {
  const htmlFile = path.join(TEST_DIR, 'index.html')
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <a href="https://example.com">External</a>
        <a href="http://example.com">External HTTP</a>
        <a href="mailto:test@example.com">Email</a>
      </body>
    </html>
  `
  await writeFile(htmlFile, html)

  await checkLinks(TEST_DIR)
})

test('checkLinks - handles relative paths from subdirectories', async () => {
  const subDir = path.join(TEST_DIR, 'sub')
  const subFile = path.join(subDir, 'page.html')
  const targetFile = path.join(TEST_DIR, 'target.html')

  await mkdir(subDir, { recursive: true })

  const subHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <a href="/target">Target</a>
      </body>
    </html>
  `
  const targetHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <h1>Target</h1>
      </body>
    </html>
  `

  await writeFile(subFile, subHtml)
  await writeFile(targetFile, targetHtml)

  await checkLinks(TEST_DIR)
})


async function expectFailure(run: Promise<void>): Promise<string> {
  try {
    await run
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected checkLinks to throw')
}

test('checkLinks - fails on a missing img src and srcset candidate', async () => {
  await mkdir(path.join(TEST_DIR, 'img'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'img', 'a.webp'), '')
  await writeFile(
    path.join(TEST_DIR, 'index.html'),
    '<img src="/img/missing.png" alt=""><picture><source srcset="/img/a.webp 1x, /img/gone.webp 2x"></picture>',
  )

  const message = await expectFailure(checkLinks(TEST_DIR))
  expect(message).toContain('Broken asset references found:')
  expect(message).toContain('- /img/missing.png from ')
  expect(message).toContain(`-> missing ${path.relative(process.cwd(), path.join(TEST_DIR, 'img', 'missing.png'))}`)
  expect(message).toContain('- /img/gone.webp from ')
  expect(message).not.toContain('/img/a.webp from')
})

test('checkLinks - resolves asset URLs with a query and skips external, data and lazy-loading URLs', async () => {
  await mkdir(path.join(TEST_DIR, 'js'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'js', 'app.js'), '')
  await writeFile(
    path.join(TEST_DIR, 'index.html'),
    [
      '<script src="/js/app.js?v=123"></script>',
      '<img src="https://cdn.example.com/a.png" alt="">',
      '<img src="//cdn.example.com/b.png" alt="">',
      '<img src="data:image/png;base64,AAAA" alt="">',
      '<img data-src="/img/later.png" data-srcset="/img/later-2x.png 2x" alt="">',
    ].join('\n'),
  )

  await checkLinks(TEST_DIR)
})

test('checkLinks - linkCheck.assets: false skips the asset check', async () => {
  await writeFile(path.join(TEST_DIR, 'index.html'), '<img src="/img/missing.png" alt="">')

  await checkLinks(TEST_DIR, { linkCheck: { assets: false } })
})

test('checkLinks - a link into a redirect stub is valid without checking its fragment', async () => {
  const stub = path.join(TEST_DIR, 'old.html')
  await writeFile(stub, '<meta http-equiv="refresh" content="0; url=/new">')
  await writeFile(path.join(TEST_DIR, 'new.html'), '<h2 id="intro">Intro</h2>')
  await writeFile(path.join(TEST_DIR, 'index.html'), '<a href="/old#intro">Old</a>')

  await checkLinks(TEST_DIR, { redirectStubs: new Set([stub]) })
})

function translatedPair(): RenderPlan[] {
  const plan = (relativeOutput: string, lang: string): RenderPlan => ({
    sourcePath: path.join(TEST_DIR, `${relativeOutput}.md`),
    outputPath: path.join(TEST_DIR, ...relativeOutput.split('/')),
    relativeOutput,
    html: '',
    meta: {
      title: '',
      description: '',
      sidebarTitle: '',
      sidebarSummary: '',
      backLinkHref: '/',
      backLinkLabel: '',
      slug: 'about',
      translationOf: 'about',
      lang,
      output: relativeOutput,
    },
  })
  return [plan('about.html', 'en'), plan('fr/about.html', 'fr')]
}

test('checkLinks - translationSiblings fails a page whose only sibling link is an hreflang tag', async () => {
  await mkdir(path.join(TEST_DIR, 'fr'), { recursive: true })
  const hreflang = '<link rel="alternate" hreflang="fr" href="https://example.com/fr/about" />'
  await writeFile(path.join(TEST_DIR, 'about.html'), `<head>${hreflang}</head>`)
  await writeFile(path.join(TEST_DIR, 'fr', 'about.html'), '<a href="/about">EN</a>')

  const message = await expectFailure(
    checkLinks(TEST_DIR, {
      linkCheck: { translationSiblings: true },
      translationGroups: new Map([['about', translatedPair()]]),
      baseUrl: 'https://example.com',
    }),
  )
  expect(message).toContain('Translated pages missing a link to a sibling translation:')
  expect(message).toContain(
    `- /fr/about from ${path.relative(process.cwd(), path.join(TEST_DIR, 'about.html'))} -> missing ${path.relative(process.cwd(), path.join(TEST_DIR, 'fr', 'about.html'))}`,
  )
  expect(message).not.toContain('- /about from')
})

test('checkLinks - translationSiblings accepts root-relative and baseUrl-absolute links', async () => {
  await mkdir(path.join(TEST_DIR, 'fr'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'about.html'), '<a href="/fr/about" hreflang="fr">FR</a>')
  await writeFile(path.join(TEST_DIR, 'fr', 'about.html'), '<a class="x" href="https://example.com/about">EN</a>')

  await checkLinks(TEST_DIR, {
    linkCheck: { translationSiblings: true },
    translationGroups: new Map([['about', translatedPair()]]),
    baseUrl: 'https://example.com',
  })
})

test('checkLinks - translationSiblings is off by default', async () => {
  await mkdir(path.join(TEST_DIR, 'fr'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'about.html'), '<p>No switcher</p>')
  await writeFile(path.join(TEST_DIR, 'fr', 'about.html'), '<p>Pas de lien</p>')

  await checkLinks(TEST_DIR, { translationGroups: new Map([['about', translatedPair()]]) })
})

test('checkLinks - a bare relative src on a nested page resolves next to the page', async () => {
  const guides = path.join(TEST_DIR, 'guides')
  await mkdir(guides, { recursive: true })
  await writeFile(path.join(guides, 'diagram.png'), '')
  await writeFile(
    path.join(guides, 'x.html'),
    '<img src="diagram.png" alt=""><iframe src="about:blank"></iframe>',
  )
  await checkLinks(TEST_DIR)

  await writeFile(path.join(guides, 'y.html'), '<img src="missing.png" alt="">')
  const message = await expectFailure(checkLinks(TEST_DIR))
  expect(message).toContain('- missing.png from ')
  expect(message).not.toContain('diagram.png')
})

test('checkLinks - keeps commas inside srcset URLs and splits candidates with or without spaces', async () => {
  await mkdir(path.join(TEST_DIR, 'img'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'img', 'a.webp'), '')
  await writeFile(
    path.join(TEST_DIR, 'index.html'),
    [
      '<img srcset="data:image/svg+xml,%3Csvg%3E 1x" alt="">',
      '<img srcset="data:image/gif;base64,R0lGOD, /img/a.webp 2x" alt="">',
    ].join('\n'),
  )
  await checkLinks(TEST_DIR)

  await writeFile(path.join(TEST_DIR, 'index.html'), '<img srcset="/img/a.webp 1x,/img/gone.webp 2x" alt="">')
  const message = await expectFailure(checkLinks(TEST_DIR))
  expect(message).toContain('- /img/gone.webp from ')
})

test('checkLinks - checks single-quoted and upper-case src and srcset', async () => {
  await writeFile(
    path.join(TEST_DIR, 'index.html'),
    `<img src='/img/single.png' alt=""><IMG SRC="/img/upper.png" alt=""><source srcset='/img/set.webp 2x'>`,
  )
  const message = await expectFailure(checkLinks(TEST_DIR))
  expect(message).toContain('- /img/single.png from ')
  expect(message).toContain('- /img/upper.png from ')
  expect(message).toContain('- /img/set.webp from ')
})

test('checkLinks - translationSiblings accepts single-quoted and upper-case anchors', async () => {
  await mkdir(path.join(TEST_DIR, 'fr'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'about.html'), `<a href='/fr/about'>FR</a>`)
  await writeFile(path.join(TEST_DIR, 'fr', 'about.html'), '<A HREF="/about">EN</A>')

  await checkLinks(TEST_DIR, {
    linkCheck: { translationSiblings: true },
    translationGroups: new Map([['about', translatedPair()]]),
  })
})

test('checkLinks - decodes percent-encoded asset URLs before resolving them', async () => {
  await mkdir(path.join(TEST_DIR, 'img'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'img', 'my photo.png'), '')
  await writeFile(path.join(TEST_DIR, 'img', 'café.png'), '')
  await writeFile(
    path.join(TEST_DIR, 'index.html'),
    '<img src="/img/my%20photo.png" alt=""><img src="img/caf%C3%A9.png?v=2" alt=""><img src="/img/100%.png" alt="">',
  )
  const message = await expectFailure(checkLinks(TEST_DIR))
  expect(message).not.toContain('my%20photo.png')
  expect(message).not.toContain('caf%C3%A9.png')
  // A malformed escape is checked as written, not thrown on.
  expect(message).toContain('- /img/100%.png from ')
})

test('checkLinks - ignores src text inside inline scripts and comments', async () => {
  await writeFile(
    path.join(TEST_DIR, 'index.html'),
    [
      '<script>const src = "/dynamic/a.png"; el.innerHTML = \'<img src="/dynamic/b.png">\'</script>',
      '<!-- <img src="/old/c.png"> -->',
      '<img src="/img/real-missing.png" alt="">',
    ].join('\n'),
  )
  const message = await expectFailure(checkLinks(TEST_DIR))
  expect(message).toContain('- /img/real-missing.png from ')
  expect(message).not.toContain('/dynamic/')
  expect(message).not.toContain('/old/c.png')
})

test('checkLinks - a parent-relative asset URL is clamped to the site root like a browser does', async () => {
  const guides = path.join(TEST_DIR, 'site', 'guides')
  await mkdir(guides, { recursive: true })
  // A file beside the output directory must not satisfy the check.
  await writeFile(path.join(TEST_DIR, 'secret.png'), '')
  await writeFile(path.join(guides, 'x.html'), '<img src="../../secret.png" alt="">')
  const message = await expectFailure(checkLinks(path.join(TEST_DIR, 'site')))
  expect(message).toContain('- ../../secret.png from ')

  await writeFile(path.join(TEST_DIR, 'site', 'secret.png'), '')
  await checkLinks(path.join(TEST_DIR, 'site'))
})

test('checkLinks - translationSiblings counts a link to the bare baseUrl origin', async () => {
  await mkdir(path.join(TEST_DIR, 'fr'), { recursive: true })
  const plans = translatedPair().map((plan) =>
    plan.meta.lang === 'en'
      ? { ...plan, outputPath: path.join(TEST_DIR, 'index.html'), relativeOutput: 'index.html' }
      : plan,
  )
  await writeFile(path.join(TEST_DIR, 'index.html'), '<a href="/fr/about">FR</a>')
  await writeFile(path.join(TEST_DIR, 'fr', 'about.html'), '<a href="https://example.com">EN</a>')

  await checkLinks(TEST_DIR, {
    linkCheck: { translationSiblings: true },
    translationGroups: new Map([['about', plans]]),
    baseUrl: 'https://example.com',
  })
})

test('checkLinks - reads src after a quoted attribute containing >', async () => {
  await writeFile(path.join(TEST_DIR, 'index.html'), `<img alt="x > y" src="/missing.png"><img title='a>b' src="/gone.png">`)
  const message = await expectFailure(checkLinks(TEST_DIR))
  expect(message).toContain('- /missing.png from ')
  expect(message).toContain('- /gone.png from ')
})

test('checkLinks - translationSiblings ignores a commented-out switcher', async () => {
  await mkdir(path.join(TEST_DIR, 'fr'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'about.html'), '<!-- <a href="/fr/about">FR</a> -->')
  await writeFile(path.join(TEST_DIR, 'fr', 'about.html'), '<a href="/about">EN</a>')

  const message = await expectFailure(
    checkLinks(TEST_DIR, {
      linkCheck: { translationSiblings: true },
      translationGroups: new Map([['about', translatedPair()]]),
    }),
  )
  expect(message).toContain('- /fr/about from ')
})

test('checkLinks - keeps a script src that follows a quoted attribute containing >', async () => {
  await writeFile(path.join(TEST_DIR, 'index.html'), '<script title="x > y" src="/js/missing.js">var a = 1</script>')
  const message = await expectFailure(checkLinks(TEST_DIR))
  expect(message).toContain('- /js/missing.js from ')
})

test('checkLinks - an asset URL needs the file itself, but an iframe may name a page', async () => {
  await mkdir(path.join(TEST_DIR, 'img', 'icon'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'img', 'logo.html'), '<p>not an image</p>')
  await writeFile(path.join(TEST_DIR, 'img', 'icon', 'index.html'), '<p>not an image</p>')
  await writeFile(path.join(TEST_DIR, 'embed.html'), '<p>embed</p>')
  await writeFile(
    path.join(TEST_DIR, 'index.html'),
    '<img src="/img/logo" alt=""><img src="/img/icon/" alt=""><iframe src="/embed"></iframe>',
  )
  const message = await expectFailure(checkLinks(TEST_DIR))
  expect(message).toContain('- /img/logo from ')
  expect(message).toContain('- /img/icon/ from ')
  expect(message).not.toContain('/embed from')
})

test('checkLinks - decodes reserved characters in asset path segments', async () => {
  await mkdir(path.join(TEST_DIR, 'img'), { recursive: true })
  await writeFile(path.join(TEST_DIR, 'img', 'a#b.png'), '')
  await writeFile(path.join(TEST_DIR, 'img', 'a?b.png'), '')
  await writeFile(
    path.join(TEST_DIR, 'index.html'),
    '<img src="/img/a%23b.png" alt=""><img src="/img/a%3Fb.png" alt=""><img src="/img%2Fa%23b.png" alt="">',
  )
  const message = await expectFailure(checkLinks(TEST_DIR))
  expect(message).not.toContain('- /img/a%23b.png from')
  expect(message).not.toContain('- /img/a%3Fb.png from')
  // An encoded slash stays inside its segment instead of becoming a separator.
  expect(message).toContain('- /img%2Fa%23b.png from ')
})
