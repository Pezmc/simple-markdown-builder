import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  BuilderConfig,
  PageMeta,
  RenderPlan,
} from './config.js'
import { extractFrontMatter, sanitizeLang, sanitizeSlug } from './frontmatter.js'
import { createMarkdownRenderer } from './markdown.js'
import { renderTemplate, clearTemplateCache } from './template.js'
import { appendUtmParams, obfuscateMailtoLinks, collectMarkdownFiles } from './utils.js'
import { ensureTranslations } from './translations.js'
import { writeSitemap, groupByTranslation, buildAlternateLinks, resolveCanonicalRelative } from './sitemap.js'
import { checkLinks } from './link-checker.js'

export async function build(config: BuilderConfig): Promise<RenderPlan[]> {
  clearTemplateCache()

  const contentDir = path.resolve(config.contentDir ?? 'content')
  const outputDir = path.resolve(config.outputDir ?? 'docs')
  const defaultLang = config.translations?.defaultLang ?? 'en'
  const supportedLangs = config.translations?.supportedLangs ?? [defaultLang]

  // Ensure translations if enabled
  if (config.translations !== false) {
    await ensureTranslations(config, contentDir, false)
  }

  const markdownFiles = await collectMarkdownFiles(contentDir)

  if (markdownFiles.length === 0) {
    console.warn('No markdown files found in content/.')
    return []
  }

  const md = createMarkdownRenderer(config.markdownOptions)
  const plans = await Promise.all(
    markdownFiles.map(async (filePath) =>
      createPlan(filePath, config, contentDir, outputDir, md, defaultLang, supportedLangs),
    ),
  )

  const groups = groupByTranslation(plans)

  await Promise.all(
    plans.map(async (plan) => {
      await mkdir(path.dirname(plan.outputPath), { recursive: true })
      const isHomepage = plan.meta.output === 'index.html'
      const alternates = buildAlternateLinks(plan, groups, config.baseUrl, defaultLang)
      const canonicalRelative = resolveCanonicalRelative(plan, groups)
      const rendered = await renderTemplate(
        plan.html,
        plan.meta,
        config.templatePath,
        config.baseUrl,
        isHomepage,
        config.homepageTemplatePath,
        alternates,
        canonicalRelative,
      )
      await writeFile(plan.outputPath, rendered)
      console.log(`Generated ${path.relative(process.cwd(), plan.outputPath)}`)
    }),
  )

  // Generate sitemap
  const groups = groupByTranslation(plans)
  await writeSitemap(plans, outputDir, config.baseUrl, defaultLang, groups)

  // Check links unless skipped
  if (!config.skipLinkCheck) {
    await checkLinks(outputDir)
  }

  return plans
}

export type { RenderPlan }

async function createPlan(
  filePath: string,
  config: BuilderConfig,
  contentDir: string,
  outputDir: string,
  md: ReturnType<typeof createMarkdownRenderer>,
  defaultLang: string,
  supportedLangs: readonly string[],
): Promise<RenderPlan> {
  const sourcePath = path.resolve(filePath)
  const relativeSource = path.relative(contentDir, sourcePath)
  const raw = await readFile(sourcePath, 'utf-8')
  const { body, meta } = extractFrontMatter(raw)

  const lang = sanitizeLang(
    meta.lang ?? inferLangFromPath(relativeSource, supportedLangs, defaultLang),
    supportedLangs,
    defaultLang,
  )

  const slug = sanitizeSlug(
    meta.slug ?? path.basename(filePath).replace(/\.md$/, ''),
  )

  const outputName = (meta.output ?? `${slug}.html`).replace(/^\/+/, '')
  const outputPath = path.join(outputDir, ...outputName.split('/'))

  const mergedMeta: PageMeta = {
    ...config.defaultMeta,
    ...meta,
    slug,
    lang,
    output: outputName,
  }

  let html = md.render(body)
  html = obfuscateMailtoLinks(html)
  html = appendUtmParams(html, config.utmParams, config.baseUrl)

  return {
    sourcePath,
    outputPath,
    relativeOutput: outputName,
    html,
    meta: mergedMeta,
  }
}

function inferLangFromPath(
  relativeSource: string,
  supportedLangs: readonly string[],
  defaultLang: string,
): string {
  const [maybeLang] = relativeSource.split(path.sep)
  if (supportedLangs.includes(maybeLang)) {
    return maybeLang
  }
  return defaultLang
}

