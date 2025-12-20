import MarkdownIt from 'markdown-it'
import type { Options as MarkdownItOptions } from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import { slugifyAnchor } from './utils.js'

export function createMarkdownRenderer(options?: MarkdownItOptions): MarkdownIt {
  const defaultOptions: MarkdownItOptions = {
    html: true,
    linkify: true,
    typographer: true,
  }

  const md = new MarkdownIt({
    ...defaultOptions,
    ...options,
  })

  md.use(markdownItAnchor, {
    level: [1, 2, 3],
    permalink: false,
    slugify: slugifyAnchor,
  })

  return md
}

