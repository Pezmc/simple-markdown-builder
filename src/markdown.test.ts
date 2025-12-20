import { test, expect } from 'bun:test'
import { createMarkdownRenderer } from './markdown.js'

test('createMarkdownRenderer - basic rendering', () => {
  const md = createMarkdownRenderer()
  const result = md.render('# Hello World')
  expect(result).toContain('<h1>Hello World</h1>')
})

test('createMarkdownRenderer - adds anchors to h1, h2, h3', () => {
  const md = createMarkdownRenderer()
  const result = md.render('# Heading 1\n## Heading 2\n### Heading 3')
  expect(result).toContain('<h1 id="heading-1">')
  expect(result).toContain('<h2 id="heading-2">')
  expect(result).toContain('<h3 id="heading-3">')
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

