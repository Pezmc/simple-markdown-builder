import MarkdownIt from 'markdown-it'
import type { Options as MarkdownItOptions } from 'markdown-it'

export function createMarkdownRenderer(options?: MarkdownItOptions): MarkdownIt {
  const defaultOptions: MarkdownItOptions = {
    html: true,
    linkify: true,
    typographer: true,
  }

  return new MarkdownIt({
    ...defaultOptions,
    ...options,
  })
}

