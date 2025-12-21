import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RenderPlan, iAlternateLink } from './config.js'
import { isBooleanEnabled } from './frontmatter.js'
import { stripHtmlExtension, normalizeIndexUrl } from './utils.js'
import { toAbsoluteUrl } from './template.js'

const DEFAULT_LANG = 'en'

export function groupByTranslation(plans: RenderPlan[]): Map<string, RenderPlan[]> {
  return plans.reduce((map, plan) => {
    const key = plan.meta.translationOf ?? plan.meta.slug ?? 'page'
    const existing = map.get(key) ?? []
    existing.push(plan)
    map.set(key, existing)
    return map
  }, new Map<string, RenderPlan[]>())
}

export function resolveCanonicalRelative(
  plan: RenderPlan,
  groups: Map<string, RenderPlan[]>,
): string {
  const groupKey = plan.meta.translationOf ?? plan.meta.slug ?? 'page'
  const group = groups.get(groupKey) ?? [plan]
  const defaultLang = plan.meta.lang ?? DEFAULT_LANG
  const english = group.find((entry) => entry.meta.lang === defaultLang)
  return english?.relativeOutput ?? plan.relativeOutput
}

export function buildAlternateLinks(
  plan: RenderPlan,
  groups: Map<string, RenderPlan[]>,
  baseUrl: string,
  defaultLang: string,
): iAlternateLink[] {
  const groupKey = plan.meta.translationOf ?? plan.meta.slug ?? 'page'
  const group = groups.get(groupKey) ?? [plan]
  const links = group.map((entry) => {
    const normalizedPath = normalizeIndexUrl(stripHtmlExtension(entry.relativeOutput))
    return {
      lang: entry.meta.lang ?? defaultLang,
      href: toAbsoluteUrl(normalizedPath, baseUrl),
    }
  })

  const canonicalRelative = normalizeIndexUrl(
    stripHtmlExtension(resolveCanonicalRelative(plan, groups)),
  )
  const xDefaultHref = toAbsoluteUrl(canonicalRelative, baseUrl)
  return [...sortAlternates(links, defaultLang), { lang: 'x-default', href: xDefaultHref }]
}

function sortAlternates(
  links: iAlternateLink[],
  defaultLang: string,
): iAlternateLink[] {
  const supportedLangs = [defaultLang, ...links.map((l) => l.lang).filter((l) => l !== defaultLang)]
  const order = new Map(supportedLangs.map((lang, index) => [lang, index]))
  return [...links].sort((a, b) => {
    const aOrder = order.get(a.lang) ?? Number.MAX_SAFE_INTEGER
    const bOrder = order.get(b.lang) ?? Number.MAX_SAFE_INTEGER
    if (aOrder === bOrder) {
      return a.lang.localeCompare(b.lang)
    }
    return aOrder - bOrder
  })
}

function isNoindexEnabled(meta: RenderPlan['meta']): boolean {
  return isBooleanEnabled(meta.noindex)
}

export async function writeSitemap(
  plans: RenderPlan[],
  outputDir: string,
  baseUrl: string,
  defaultLang: string = DEFAULT_LANG,
  translationGroups?: Map<string, RenderPlan[]>,
): Promise<void> {
  const unique = new Map<string, RenderPlan>()
  plans.forEach((plan) => unique.set(plan.relativeOutput, plan))

  const groups = translationGroups ?? groupByTranslation(plans)

  const rows = [...unique.values()]
    .filter((plan) => !isNoindexEnabled(plan.meta))
    .sort((a, b) => a.relativeOutput.localeCompare(b.relativeOutput))
    .map((plan) => {
      const alternates = buildAlternateLinks(plan, groups, baseUrl, defaultLang).filter(
        (alt) => alt.lang !== 'x-default',
      )
      const altLinks = alternates.length > 0
        ? alternates
            .map(
              (alt) =>
                `    <xhtml:link rel="alternate" hreflang="${alt.lang}" href="${alt.href}" />`,
            )
            .join('\n')
        : ''
      const normalizedLoc = normalizeIndexUrl(stripHtmlExtension(plan.relativeOutput))
      const loc = toAbsoluteUrl(normalizedLoc, baseUrl)
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        altLinks,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${rows}
</urlset>
`

  const sitemapPath = path.join(outputDir, 'sitemap.xml')
  await writeFile(sitemapPath, sitemap)
  console.log(`Generated ${path.relative(process.cwd(), sitemapPath)}`)
}

