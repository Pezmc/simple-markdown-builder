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
  readonly twitterImage?: string
}

// The keys the builder itself reads. `defaultMeta` is typed from this closed
// shape because `Omit` over an index signature would drop every named key.
export interface KnownPageMeta {
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
  readonly twitterImage?: string
}

// Front-matter keys the builder does not know pass through onto `meta` as-is.
export interface PageMeta extends KnownPageMeta {
  readonly [key: string]: string | boolean | undefined
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

export interface PageRenderContext {
  readonly plans: readonly RenderPlan[]
  readonly groups: ReadonlyMap<string, readonly RenderPlan[]>
}

export interface BuilderConfig {
  readonly contentDir?: string
  readonly outputDir?: string
  readonly baseUrl: string
  readonly defaultMeta: Omit<KnownPageMeta, 'slug' | 'output' | 'lang' | 'translationOf' | 'translate' | 'noindex'>
  readonly templatePath: string
  readonly homepageTemplatePath?: string
  readonly markdownOptions?: MarkdownItOptions
  readonly translations?: false | TranslationConfig
  readonly utmParams?: UtmParams
  readonly noreferrer?: boolean
  readonly skipLinkCheck?: boolean
  readonly clean?: boolean
  readonly onPageRendered?: (
    html: string,
    plan: RenderPlan,
    context: PageRenderContext,
  ) => string | Promise<string>
  readonly onPagesWritten?: (
    plans: readonly RenderPlan[],
    outputDir: string,
  ) => void | Promise<void>
}

export function getDefaultLang(config: BuilderConfig): string {
  return config.translations !== false ? (config.translations?.defaultLang ?? 'en') : 'en'
}

export function getSupportedLangs(config: BuilderConfig, defaultLang: string): readonly string[] {
  return config.translations !== false
    ? (config.translations?.supportedLangs ?? [defaultLang])
    : [defaultLang]
}

