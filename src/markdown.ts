import MarkdownIt from 'markdown-it'
import type { Options as MarkdownItOptions } from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'

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
    slugify: (s: string) => {
      return s
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
    },
  })

  return md
}

