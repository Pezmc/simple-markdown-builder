import type { TargetLanguageCode } from 'deepl-node'
import type { Options as MarkdownItOptions } from 'markdown-it'

export interface FrontMatter {
  readonly title?: string
  readonly description?: string
  readonly sidebarTitle?: string
  readonly sidebarSummary?: string
  readonly backLinkHref?: string
  readonly backLinkLabel?: string
  readonly slug?: string
  readonly lang?: string
  readonly translationOf?: string
  readonly translate?: string | boolean
  readonly noindex?: string | boolean
  readonly ogImage?: string
}

export interface PageMeta {
  readonly title: string
  readonly description: string
  readonly sidebarTitle: string
  readonly sidebarSummary: string
  readonly backLinkHref: string
  readonly backLinkLabel: string
  readonly slug?: string
  readonly output: string
  readonly lang?: string
  readonly translationOf?: string
  readonly translate?: string | boolean
  readonly noindex?: string | boolean
  readonly ogImage?: string
}

export interface RenderPlan {
  readonly sourcePath: string
  readonly outputPath: string
  readonly relativeOutput: string
  readonly html: string
  readonly meta: PageMeta
}

export interface iAlternateLink {
  readonly lang: string
  readonly href: string
}

export interface MissingLink {
  readonly fromFile: string
  readonly href: string
  readonly resolvedPath: string
}

export interface TranslatePlan {
  readonly slug: string
  readonly translationOf: string
  readonly targetLang: TargetLanguageCode
  readonly sourceBody: string
  readonly sourceMeta: FrontMatter
  readonly sourceRelativeDir: string
  readonly sourceFileName: string
}

export interface UtmParams {
  readonly [key: string]: string
}

export interface TranslationConfig {
  readonly apiKey?: string
  readonly targetLanguages: readonly TargetLanguageCode[]
  readonly customGlossary?: Readonly<Partial<Record<TargetLanguageCode, Record<string, string>>>>
  readonly defaultLang?: string
  readonly supportedLangs?: readonly string[]
}

export interface BuilderConfig {
  readonly contentDir?: string
  readonly outputDir?: string
  readonly baseUrl: string
  readonly defaultMeta: Omit<PageMeta, 'slug' | 'output' | 'lang' | 'translationOf' | 'translate' | 'noindex' | 'ogImage'>
  readonly templatePath: string
  readonly homepageTemplatePath?: string
  readonly markdownOptions?: MarkdownItOptions
  readonly translations?: false | TranslationConfig
  readonly utmParams?: UtmParams
  readonly skipLinkCheck?: boolean
  readonly clean?: boolean
}

export function getDefaultLang(config: BuilderConfig): string {
  return config.translations !== false ? (config.translations?.defaultLang ?? 'en') : 'en'
}

export function getSupportedLangs(config: BuilderConfig, defaultLang: string): readonly string[] {
  return config.translations !== false
    ? (config.translations?.supportedLangs ?? [defaultLang])
    : [defaultLang]
}

