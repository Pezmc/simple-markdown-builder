import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { checkLinks } from './link-checker.js'

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

