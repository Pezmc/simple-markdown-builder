import { test, expect } from 'bun:test'
import { createMarkdownRenderer } from './markdown.js'

test('createMarkdownRenderer - basic rendering', () => {
  const md = createMarkdownRenderer()
  const result = md.render('# Hello World')
  expect(result).toContain('<h1>Hello World</h1>')
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

