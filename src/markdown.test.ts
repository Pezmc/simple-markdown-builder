import { test, expect } from 'bun:test'
import { createMarkdownRenderer, renderMarkdown } from './markdown.js'

test('createMarkdownRenderer - basic rendering', () => {
  const md = createMarkdownRenderer()
  const result = md.render('# Hello World')
  expect(result).toContain('<h1')
  expect(result).toContain('Hello World')
  expect(result).toContain('</h1>')
})

test('createMarkdownRenderer - adds anchors to h1, h2, h3', () => {
  const md = createMarkdownRenderer()
  const result = md.render('# Heading 1\n## Heading 2\n### Heading 3')
  expect(result).toContain('id="heading-1"')
  expect(result).toContain('id="heading-2"')
  expect(result).toContain('id="heading-3"')
})

test('createMarkdownRenderer - folds accents in anchors', () => {
  const md = createMarkdownRenderer()
  const result = md.render('# Les leçons\n## Où trouver nos cours ?')
  expect(result).toContain('id="les-lecons"')
  expect(result).toContain('id="ou-trouver-nos-cours"')
})

test('createMarkdownRenderer - with custom options', () => {
  const md = createMarkdownRenderer({ html: false })
  const result = md.render('<script>alert("xss")</script>')
  expect(result).not.toContain('<script>')
})

test('createMarkdownRenderer - linkify', () => {
  const md = createMarkdownRenderer()
  const result = md.render('Visit https://example.com')
  expect(result).toContain('href="https://example.com"')
})

test('createMarkdownRenderer - trims leading/trailing hyphens from anchor IDs', () => {
  const md = createMarkdownRenderer()
  const result = md.render('## 🎪 What\'s happening at RopeLabs')
  // Should not have leading hyphen in ID
  expect(result).toContain('id="whats-happening-at-ropelabs"')
  expect(result).not.toContain('id="-whats-happening-at-ropelabs"')
})


test('renderMarkdown - collects anchored headings as plain text in document order', () => {
  const md = createMarkdownRenderer()
  const { html, headings } = renderMarkdown(
    md,
    '# Intro\n\n## Q&amp;A: **"bold"** <em>raw</em> `code`\n\n#### Deep\n\n<h2 id="raw">Raw</h2>\n\n## Intro',
  )
  expect(headings).toEqual([
    { id: 'intro', text: 'Intro', level: 1 },
    { id: 'qa-bold-raw-code', text: 'Q&A: \u201cbold\u201d raw code', level: 2 },
    { id: 'intro-1', text: 'Intro', level: 2 },
  ])
  for (const { id } of headings) {
    expect(html).toContain(`id="${id}"`)
  }
  expect(html).toBe(md.render('# Intro\n\n## Q&amp;A: **"bold"** <em>raw</em> `code`\n\n#### Deep\n\n<h2 id="raw">Raw</h2>\n\n## Intro'))
})

test('renderMarkdown - keeps a space where a setext heading breaks lines', () => {
  const { headings } = renderMarkdown(createMarkdownRenderer(), 'Line one\nline two\n===')
  expect(headings[0]?.text).toBe('Line one line two')
})

test('renderMarkdown - skips headings with an empty anchor and spaces an inline <br>', () => {
  const { html, headings } = renderMarkdown(createMarkdownRenderer(), '## ![Logo](logo.png)\n\n## a<br>b\n\n##')
  expect(html).toContain('id=""')
  expect(headings).toEqual([{ id: 'ab', text: 'a b', level: 2 }])
})
