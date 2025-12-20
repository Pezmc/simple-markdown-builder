import MarkdownIt from 'markdown-it'
import type { MarkdownIt as MarkdownItType } from 'markdown-it'

export function createMarkdownRenderer(options?: MarkdownItType.Options): MarkdownIt {
  const defaultOptions: MarkdownItType.Options = {
    html: true,
    linkify: true,
    typographer: true,
  }

  return new MarkdownIt({
    ...defaultOptions,
    ...options,
  })
}

