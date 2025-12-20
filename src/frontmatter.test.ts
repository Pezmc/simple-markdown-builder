import { test, expect } from 'bun:test'
import { extractFrontMatter, sanitizeSlug, isBooleanEnabled } from './frontmatter.js'

test('extractFrontMatter - with front matter', () => {
  const input = `---
title: Test Title
description: Test Description
---
# Content
Hello world`
  const result = extractFrontMatter(input)
  expect(result.meta.title).toBe('Test Title')
  expect(result.meta.description).toBe('Test Description')
  expect(result.body).toBe('# Content\nHello world')
})

test('extractFrontMatter - without front matter', () => {
  const input = '# Content\nHello world'
  const result = extractFrontMatter(input)
  expect(result.meta).toEqual({})
  expect(result.body).toBe('# Content\nHello world')
})

test('extractFrontMatter - with quoted values', () => {
  const input = `---
title: "Test: Title"
description: "Test Description"
---
Content`
  const result = extractFrontMatter(input)
  expect(result.meta.title).toBe('Test: Title')
  expect(result.meta.description).toBe('Test Description')
})

test('extractFrontMatter - with boolean fields', () => {
  const input = `---
title: Test
noindex: true
translate: yes
---
Content`
  const result = extractFrontMatter(input)
  expect(result.meta.noindex).toBe(true)
  expect(result.meta.translate).toBe(true)
})

test('sanitizeSlug', () => {
  expect(sanitizeSlug('Hello World')).toBe('hello-world')
  expect(sanitizeSlug('Test--Multiple---Dashes')).toBe('test-multiple-dashes')
  expect(sanitizeSlug('Special!@#Characters')).toBe('special-characters')
  expect(sanitizeSlug('  Trimmed  ')).toBe('trimmed')
})

test('isBooleanEnabled', () => {
  expect(isBooleanEnabled(true)).toBe(true)
  expect(isBooleanEnabled(false)).toBe(false)
  expect(isBooleanEnabled('true')).toBe(true)
  expect(isBooleanEnabled('yes')).toBe(true)
  expect(isBooleanEnabled('1')).toBe(true)
  expect(isBooleanEnabled('false')).toBe(false)
  expect(isBooleanEnabled(undefined)).toBe(false)
})

