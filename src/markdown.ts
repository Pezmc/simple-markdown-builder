import MarkdownIt from 'markdown-it'
import type { Options as MarkdownItOptions } from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import type { Heading } from './config.js'
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

const BR_TAG = /^<br\s*\/?>$/i
const EMPTY_ANCHOR = /^(-\d+)?$/

export interface RenderedMarkdown {
  readonly html: string
  readonly headings: Heading[]
}

// Parses once and renders the same tokens, so each heading's id is the one
// markdown-it-anchor set (deduplicated) and the one written into the HTML.
export function renderMarkdown(md: MarkdownIt, body: string): RenderedMarkdown {
  const env = {}
  const tokens = md.parse(body, env)
  const headings: Heading[] = []
  tokens.forEach((token, index) => {
    const id = token.type === 'heading_open' ? token.attrGet('id') : null
    // A heading with no sluggable text gets "" (or "-1", "-2" when repeated),
    // which links nowhere useful. Real slugs never start with "-".
    if (id === null || EMPTY_ANCHOR.test(id)) {
      return
    }
    // Child text tokens hold decoded text; a line break (setext or an inline
    // <br>) becomes a space, and other html_inline and markup tokens are dropped.
    const text = (tokens[index + 1]?.children ?? [])
      .map((child) => {
        if (child.type === 'softbreak' || child.type === 'hardbreak') return ' '
        if (child.type === 'html_inline' && BR_TAG.test(child.content)) return ' '
        return child.type === 'text' || child.type === 'code_inline' ? child.content : ''
      })
      .join('')
    headings.push({ id, text, level: Number(token.tag.slice(1)) })
  })
  return { html: md.renderer.render(tokens, md.options, env), headings }
}
