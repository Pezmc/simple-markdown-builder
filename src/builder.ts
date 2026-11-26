import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  BuilderConfig,
  PageMeta,
  RenderPlan,
} from './config.js'
import { getDefaultLang, getSupportedLangs } from './config.js'
import { extractFrontMatter, sanitizeLang, sanitizeSlug, inferLangFromPath } from './frontmatter.js'
import { createMarkdownRenderer } from './markdown.js'
import {
  BUILT_IN_PLACEHOLDERS,
  clearTemplateCache,
  loadTemplate,
  renderTemplate,
  templatePlaceholderNames,
  toPlaceholderName,
} from './template.js'
import { appendUtmParams, obfuscateMailtoLinks, collectMarkdownFiles, extractSlugFromPath, normalizePathSeparators, cleanHtmlFiles, logWarning } from './utils.js'
import { ensureTranslations } from './translations.js'
import { writeSitemap, groupByTranslation, buildAlternateLinks, resolveCanonicalRelative } from './sitemap.js'
import { checkLinks } from './link-checker.js'
import {
  assertRobotsWritable,
  gitLastModifiedDates,
  isNotFoundOutput,
  lastModifiedFor,
  warnRelativeUrlsOnNotFound,
  writeRobots,
} from './seo.js'
import { planRedirectStubs, writeRedirectStubs } from './redirects.js'

export async function build(config: BuilderConfig): Promise<RenderPlan[]> {
  clearTemplateCache()

  const contentDir = path.resolve(config.contentDir ?? 'content')
  const outputDir = path.resolve(config.outputDir ?? 'docs')

  // Before anything changes output, content or spends translation quota.
  if (config.robots) {
    await assertRobotsWritable(outputDir)
  }

  // Clean HTML files if requested
  if (config.clean) {
    await cleanHtmlFiles(outputDir)
  }
  
  const defaultLang = getDefaultLang(config)
  const supportedLangs = getSupportedLangs(config, defaultLang)

  // Ensure translations if enabled
  if (config.translations !== false) {
    await ensureTranslations(config, contentDir, false)
  }

  const markdownFiles = await collectMarkdownFiles(contentDir)

  if (markdownFiles.length === 0) {
    logWarning('No markdown files found in content/.')
    return []
  }

  const dates = config.lastmod === 'git' ? await gitLastModifiedDates(contentDir) : undefined

  const md = createMarkdownRenderer(config.markdownOptions)
  const plans = await Promise.all(
    markdownFiles.map(async (filePath) =>
      createPlan(filePath, config, contentDir, outputDir, md, defaultLang, supportedLangs, dates),
    ),
  )

  assertUniqueOutputs(plans)
  // Validated before any page is written, so a bad redirect fails fast.
  const redirectStubs = planRedirectStubs(config, plans, outputDir, defaultLang, supportedLangs)

  // Before any page is written, so include and section errors fail fast.
  await warnUnsetPlaceholders(config, plans, supportedLangs)

  const groups = groupByTranslation(plans)
  // 404 pages stand in for every missing URL, so they are nobody's translation.
  const hreflangGroups = groupByTranslation(
    plans.filter((plan) => !isNotFoundOutput(plan.relativeOutput, supportedLangs)),
  )

  await Promise.all(
    plans.map(async (plan) => {
      await mkdir(path.dirname(plan.outputPath), { recursive: true })
      const isHomepage = isHomepageOutput(plan.relativeOutput, supportedLangs)
      const notFound = isNotFoundOutput(plan.relativeOutput, supportedLangs)
      const alternates = notFound
        ? undefined
        : buildAlternateLinks(plan, hreflangGroups, config.baseUrl, defaultLang)
      const canonicalRelative = resolveCanonicalRelative(plan, hreflangGroups)
      const jsonLd = config.jsonLd?.(plan, { plans, groups })
      const rendered = await renderTemplate(
        plan.html,
        plan.meta,
        config.templatePath,
        config.baseUrl,
        isHomepage,
        config.homepageTemplatePath,
        alternates,
        canonicalRelative,
        { jsonLd, notFound },
      )
      const html = config.onPageRendered
        ? await config.onPageRendered(rendered, plan, { plans, groups })
        : rendered
      if (notFound) {
        warnRelativeUrlsOnNotFound(html, plan.relativeOutput)
      }
      await writeFile(plan.outputPath, html)
      console.log(`Generated ${path.relative(process.cwd(), plan.outputPath)}`)
    }),
  )

  await writeRedirectStubs(redirectStubs, config)

  await config.onPagesWritten?.(plans, outputDir)

  // Generate sitemap
  await writeSitemap(plans, outputDir, config.baseUrl, defaultLang, hreflangGroups)

  if (config.robots) {
    // Again here: onPagesWritten may have copied a hand-written robots.txt in.
    await assertRobotsWritable(outputDir)
    await writeRobots(outputDir, config.baseUrl, config.robots)
  }

  // Check links unless skipped
  if (!config.skipLinkCheck) {
    await checkLinks(outputDir, {
      linkCheck: config.linkCheck,
      redirectStubs: new Set(redirectStubs.map((stub) => stub.outputPath)),
      translationGroups: hreflangGroups,
      baseUrl: config.baseUrl,
    })
  }

  return plans
}

export type { RenderPlan }

// Slug sanitising folds "résumé" and "resume" to the same name; writing both
// concurrently would let one page silently overwrite the other.
function assertUniqueOutputs(plans: readonly RenderPlan[]): void {
  const sources = new Map<string, string>()
  for (const plan of plans) {
    const existing = sources.get(plan.outputPath)
    if (existing) {
      throw new Error(
        `Duplicate output ${plan.relativeOutput} from ${path.relative(process.cwd(), existing)} and ${path.relative(process.cwd(), plan.sourcePath)}`,
      )
    }
    sources.set(plan.outputPath, plan.sourcePath)
  }
}

function isHomepageOutput(relativeOutput: string, supportedLangs: readonly string[]): boolean {
  return (
    relativeOutput === 'index.html' ||
    supportedLangs.some((lang) => relativeOutput === `${lang}/index.html`)
  )
}

// A placeholder no page and no defaultMeta sets is probably a typo.
async function warnUnsetPlaceholders(
  config: BuilderConfig,
  plans: readonly RenderPlan[],
  supportedLangs: readonly string[],
): Promise<void> {
  // Like rendering, the homepage template is only read when a homepage uses it.
  const rendersHomepage = plans.some((plan) => isHomepageOutput(plan.relativeOutput, supportedLangs))
  const templatePaths = [
    config.templatePath,
    ...(rendersHomepage && config.homepageTemplatePath ? [config.homepageTemplatePath] : []),
  ]
  const used = new Set<string>()
  for (const templatePath of templatePaths) {
    for (const name of templatePlaceholderNames(await loadTemplate(templatePath))) used.add(name)
  }
  const set = new Set(
    plans.flatMap((plan) =>
      Object.entries(plan.meta)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => toPlaceholderName(key)),
    ),
  )
  for (const name of used) {
    if (!BUILT_IN_PLACEHOLDERS.has(name) && !set.has(name)) {
      logWarning(`Template placeholder {{${name}}} is not set by any page or defaultMeta; it renders empty.`)
    }
  }
}

async function createPlan(
  filePath: string,
  config: BuilderConfig,
  contentDir: string,
  outputDir: string,
  md: ReturnType<typeof createMarkdownRenderer>,
  defaultLang: string,
  supportedLangs: readonly string[],
  dates: ReadonlyMap<string, string> | undefined,
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
    meta.slug ?? extractSlugFromPath(filePath),
  )

  // Preserve directory structure from content directory
  // Language directories are preserved in output (e.g., fr/page.md -> fr/page.html)
  // Other directories are also preserved (e.g., classes/beginner.md -> classes/beginner.html)
  // If slug already contains a path (e.g., "shop/aerial-silks"), use it directly
  const relativeDir = path.dirname(relativeSource)
  const outputName = slug.includes('/')
    ? normalizePathSeparators(`${slug}.html`)
    : relativeDir !== '.'
      ? normalizePathSeparators(path.join(relativeDir, `${slug}.html`))
      : `${slug}.html`
  const outputPath = path.join(outputDir, ...outputName.split('/'))

  const mergedMeta: PageMeta = {
    ...config.defaultMeta,
    ...meta,
    slug,
    lang,
    output: outputName,
    // Git is the only source, so a front-matter `lastModified` key never reaches the sitemap.
    lastModified: lastModifiedFor(dates, contentDir, sourcePath),
    // Keeps the 404 page out of the sitemap and search results.
    ...(isNotFoundOutput(outputName, supportedLangs) ? { noindex: true } : {}),
  }

  let html = md.render(body)
  html = obfuscateMailtoLinks(html)
  html = appendUtmParams(html, config.utmParams, config.baseUrl, config.noreferrer)

  return {
    sourcePath,
    outputPath,
    relativeOutput: outputName,
    html,
    meta: mergedMeta,
  }
}


