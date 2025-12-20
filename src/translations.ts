import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GlossaryEntries, Translator } from 'deepl-node'
import type { TargetLanguageCode } from 'deepl-node'
import type {
  BuilderConfig,
  FrontMatter,
  TranslatePlan,
  TranslationConfig,
} from './config.js'
import { extractFrontMatter, sanitizeSlug, isBooleanEnabled } from './frontmatter.js'
import { collectMarkdownFiles } from './utils.js'

let translatorInstance: Translator | null | undefined
let translationWarned = false
const glossaryCache: Partial<Record<TargetLanguageCode, string | null>> = {}

export async function ensureTranslations(
  config: BuilderConfig,
  contentDir: string,
  refreshTranslations: boolean = false,
): Promise<void> {
  if (config.translations === false) {
    return
  }

  if (!config.translations) {
    return
  }

  const translator = await getTranslator(config.translations)
  if (!translator) {
    if (!translationWarned && config.translations.targetLanguages.length > 0) {
      translationWarned = true
      console.warn('Skipping automatic translations: set API key to enable.')
    }
    return
  }

  const defaultLang = config.translations.defaultLang ?? 'en'
  const supportedLangs = config.translations.supportedLangs ?? [defaultLang]
  const targetLangs = config.translations.targetLanguages

  const markdownFiles = await collectMarkdownFiles(contentDir)

  const translationPlans: TranslatePlan[] = []
  for (const sourcePath of markdownFiles) {
    const relativeSource = path.relative(contentDir, sourcePath)
    const [firstSegment] = relativeSource.split(path.sep)
    if (supportedLangs.includes(firstSegment) && firstSegment !== defaultLang) {
      continue
    }
    const raw = await readFile(sourcePath, 'utf-8')
    const { body, meta } = extractFrontMatter(raw)
    const lang = meta.lang ?? firstSegment
    if (lang !== defaultLang) {
      continue
    }

    if (!isTranslateEnabled(meta.translate)) {
      continue
    }

    const slug = sanitizeSlug(
      meta.slug ?? path.basename(sourcePath).replace(/\.md$/, ''),
    )
    const translationOf = (meta.translationOf ?? slug).trim() || slug
    const relativeDir = path.dirname(relativeSource)
    const cleanDir = relativeDir === '.' ? '' : relativeDir
    const sourceFileName = path.basename(sourcePath)

    for (const targetLang of targetLangs) {
      const targetRelative = path.join(targetLang, cleanDir, sourceFileName)
      const targetPath = path.join(contentDir, targetRelative)
      if (!refreshTranslations) {
        try {
          const sourceStats = await stat(sourcePath)
          const targetStats = await stat(targetPath)
          if (targetStats.mtimeMs >= sourceStats.mtimeMs) {
            continue
          }
        } catch {
          // Missing translation or source file, proceed.
        }
      }

      translationPlans.push({
        slug,
        translationOf,
        targetLang,
        sourceBody: body,
        sourceMeta: meta,
        sourceRelativeDir: cleanDir,
        sourceFileName,
      })
    }
  }

  if (translationPlans.length === 0) {
    return
  }

  for (const plan of translationPlans) {
    const translation = await translateMarkdownPlan(plan, translator, config)
    const targetRelative = path.join(
      plan.targetLang,
      plan.sourceRelativeDir,
      plan.sourceFileName,
    )
    const targetPath = path.join(contentDir, targetRelative)
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, translation.markdown)
    console.log(`Translated -> ${path.relative(process.cwd(), targetPath)}`)
  }
}

async function translateMarkdownPlan(
  plan: TranslatePlan,
  translator: Translator,
  config: BuilderConfig,
): Promise<{ readonly slug: string; readonly markdown: string }> {
  const mergedMeta: FrontMatter = {
    ...config.defaultMeta,
    ...plan.sourceMeta,
    slug: plan.slug,
    translationOf: plan.translationOf,
  }

  const translatedMeta = await translateMetaFields(
    mergedMeta,
    plan.targetLang,
    translator,
    config.translations as TranslationConfig,
  )
  const translatedBody = await translateMarkdownBody(
    plan.sourceBody,
    plan.targetLang,
    translator,
    config.translations as TranslationConfig,
  )

  const { lang: _, ...metaWithoutLang } = { ...mergedMeta, ...translatedMeta }
  const frontMatter = formatFrontMatter({
    ...metaWithoutLang,
  })

  return {
    slug: translatedMeta.slug ?? plan.slug,
    markdown: `${frontMatter}\n\n${translatedBody}\n`,
  }
}

async function translateMetaFields(
  meta: FrontMatter,
  targetLang: TargetLanguageCode,
  translator: Translator,
  translationConfig: TranslationConfig,
): Promise<Partial<FrontMatter>> {
  const translateOrFallback = async (
    value: string | undefined,
  ): Promise<string | undefined> => {
    if (!value) {
      return value
    }
    return translateField(value, targetLang, translator, translationConfig)
  }

  return {
    title: await translateOrFallback(meta.title),
    slug: await translateSlug(meta.slug ?? meta.title ?? '', targetLang, translator),
    description: await translateOrFallback(meta.description),
    sidebarTitle: await translateOrFallback(meta.sidebarTitle),
    sidebarSummary: await translateOrFallback(meta.sidebarSummary),
    backLinkLabel: await translateOrFallback(meta.backLinkLabel),
  }
}

async function translateSlug(
  slug: string,
  targetLang: TargetLanguageCode,
  translator: Translator,
): Promise<string> {
  if (!slug) {
    return slug
  }

  const slugAsWords = slug.replace(/-/g, ' ')
  const translatedResult = await translator.translateText(slugAsWords, null, targetLang)
  const translated = Array.isArray(translatedResult)
    ? translatedResult.map((item) => item.text).join('\n')
    : translatedResult.text

  return sanitizeSlug(translated)
}

async function translateField(
  value: string,
  targetLang: TargetLanguageCode,
  translator: Translator,
  translationConfig: TranslationConfig,
): Promise<string> {
  if (!value.trim()) {
    return value
  }
  const glossaryId = await getCustomGlossaryId(translator, targetLang, translationConfig)
  const result = await translator.translateText(
    value,
    null,
    targetLang,
    glossaryId ? { glossary: glossaryId } : undefined,
  )
  const translated = Array.isArray(result)
    ? result.map((item) => item.text).join('\n')
    : result.text
  return translated
}

async function translateMarkdownBody(
  body: string,
  targetLang: TargetLanguageCode,
  translator: Translator,
  translationConfig: TranslationConfig,
): Promise<string> {
  const linkPattern = /\[([^[\]]+?)\]\(([^)]+?)\)/g
  const links: Array<{
    readonly placeholder: string
    readonly text: string
    readonly href: string
  }> = []

  let linkIndex = 0
  const bodyWithPlaceholders = body.replace(
    linkPattern,
    (_match, text: string, href: string) => {
      const placeholder = `@@LINK_${linkIndex}@@`
      links.push({ placeholder, text, href })
      linkIndex += 1
      return placeholder
    },
  )

  const translatedBody = await translateField(
    bodyWithPlaceholders,
    targetLang,
    translator,
    translationConfig,
  )

  const translatedLinks = await Promise.all(
    links.map(async (link) => {
      const translatedText = await translateField(
        link.text,
        targetLang,
        translator,
        translationConfig,
      )
      return { ...link, text: translatedText }
    }),
  )

  return translatedLinks.reduce((acc, link) => {
    return acc.replace(link.placeholder, `[${link.text}](${link.href})`)
  }, translatedBody)
}

function formatFrontMatter(meta: FrontMatter): string {
  const lines: string[] = ['---']

  const entries: Array<[keyof FrontMatter, string | undefined]> = [
    ['title', meta.title],
    ['description', meta.description],
    ['sidebarTitle', meta.sidebarTitle],
    ['sidebarSummary', meta.sidebarSummary],
    ['backLinkHref', meta.backLinkHref],
    ['backLinkLabel', meta.backLinkLabel],
    ['slug', meta.slug],
    ['translationOf', meta.translationOf],
    ['noindex', meta.noindex !== undefined ? String(meta.noindex) : undefined],
  ]

  for (const [key, value] of entries) {
    if (value !== undefined) {
      lines.push(`${key}: ${formatMetaValue(key, value)}`)
    }
  }

  lines.push('---')
  return lines.join('\n')
}

function formatMetaValue(key: keyof FrontMatter, value: string): string {
  const plainKeys: Array<keyof FrontMatter> = [
    'slug',
    'lang',
    'translationOf',
    'backLinkHref',
    'backLinkLabel',
    'translate',
    'noindex',
  ]
  if (plainKeys.includes(key)) {
    return value
  }
  const needsQuotes = /[:"]/g.test(value) || /^\s|\s$/.test(value)
  if (!needsQuotes) {
    return value
  }
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

async function getCustomGlossaryId(
  translator: Translator,
  targetLang: TargetLanguageCode,
  translationConfig: TranslationConfig,
): Promise<string | null> {
  const cached = glossaryCache[targetLang]
  if (cached !== undefined) {
    return cached
  }

  const entries = translationConfig.customGlossary?.[targetLang]
  if (!entries || Object.keys(entries).length === 0) {
    glossaryCache[targetLang] = null
    return null
  }

  const defaultLang = translationConfig.defaultLang ?? 'en'
  const glossaryName = `simple-markdown-builder-custom-${defaultLang}-${targetLang}`

  try {
    const existing = (await translator.listGlossaries()).find(
      (item) =>
        item.name === glossaryName &&
        item.sourceLang.toLowerCase() === defaultLang &&
        item.targetLang.toLowerCase() === targetLang,
    )
    if (existing) {
      glossaryCache[targetLang] = existing.glossaryId
      return existing.glossaryId
    }

    const glossaryEntries = new GlossaryEntries(entries)
    const glossary = await translator.createGlossary(
      glossaryName,
      defaultLang,
      targetLang,
      glossaryEntries,
    )
    glossaryCache[targetLang] = glossary.glossaryId
    return glossary.glossaryId
  } catch {
    // If glossaries are unsupported or creation fails, skip silently.
    glossaryCache[targetLang] = null
    return null
  }
}

async function getTranslator(
  translationConfig: TranslationConfig,
): Promise<Translator | null> {
  if (translatorInstance !== undefined) {
    return translatorInstance
  }
  translatorInstance = translationConfig.apiKey
    ? new Translator(translationConfig.apiKey)
    : null
  return translatorInstance
}

