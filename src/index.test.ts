import { test, expect } from 'bun:test'
import * as index from './index.js'
import * as frontmatter from './frontmatter.js'
import * as utils from './utils.js'

test('index - exports the slug and anchor helpers the builder itself uses', () => {
  expect(index.sanitizeSlug).toBe(frontmatter.sanitizeSlug)
  expect(index.foldAccents).toBe(utils.foldAccents)
  expect(index.slugifyAnchor).toBe(utils.slugifyAnchor)
  expect(index.sanitizeSlug('Leçons Particulières')).toBe('lecons-particulieres')
  expect(index.slugifyAnchor('Les leçons')).toBe('les-lecons')
})
