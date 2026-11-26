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
  readonly ogImageWidth?: string
  readonly ogImageHeight?: string
  readonly ogType?: string
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
  readonly ogImageWidth?: string
  readonly ogImageHeight?: string
  readonly ogType?: string
  readonly twitterImage?: string
  // ISO date (YYYY-MM-DD) of the source file's last commit, set when `lastmod: 'git'`.
  readonly lastModified?: string
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
  // The anchored (h1–h3) markdown headings in document order.
  readonly headings: readonly Heading[]
}

export interface Heading {
  // The id attribute the rendered heading carries.
  readonly id: string
  // Plain text: inline markup stripped, entities decoded.
  readonly text: string
  readonly level: number
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

export interface LinkCheckConfig {
  // Check local `src` and `srcset` URLs (images, scripts, <source>). Default: true.
  readonly assets?: boolean
  // Require every translated page to link (<a href>) to each sibling
  // translation. Default: false.
  readonly translationSiblings?: boolean
}

export interface Redirect {
  readonly from: string
  readonly to: string
}

export interface RedirectInfo {
  // The stub's site path, e.g. "/fr/about".
  readonly from: string
  readonly to: string
  readonly lang: string
  readonly reason: 'moved' | 'untranslated'
}

export interface PageRenderContext {
  readonly plans: readonly RenderPlan[]
  readonly groups: ReadonlyMap<string, readonly RenderPlan[]>
  // The page's hreflang alternates, x-default last; empty on 404 pages.
  readonly alternates: readonly iAlternateLink[]
}

export type JsonLd = object | readonly object[]

export interface RobotsConfig {
  readonly disallow?: readonly string[]
}

export interface BuilderConfig {
  readonly contentDir?: string
  readonly outputDir?: string
  readonly baseUrl: string
  // Extra keys fill template placeholders, like front-matter keys.
  readonly defaultMeta: Omit<KnownPageMeta, 'slug' | 'output' | 'lang' | 'translationOf' | 'translate' | 'noindex' | 'lastModified'> & {
    readonly [key: string]: string | boolean | undefined
  }
  readonly templatePath: string
  readonly homepageTemplatePath?: string
  readonly markdownOptions?: MarkdownItOptions
  readonly translations?: false | TranslationConfig
  readonly utmParams?: UtmParams
  readonly noreferrer?: boolean
  readonly skipLinkCheck?: boolean
  readonly linkCheck?: LinkCheckConfig
  readonly redirects?: readonly Redirect[]
  readonly translationFallback?: 'redirect'
  readonly renderRedirect?: (info: RedirectInfo) => string | Promise<string>
  readonly clean?: boolean
  readonly lastmod?: 'git' | false
  readonly robots?: boolean | RobotsConfig
  readonly jsonLd?: (
    plan: RenderPlan,
    context: PageRenderContext,
  ) => JsonLd | undefined
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


// Identity helper so `smb.config.ts` gets `BuilderConfig` type checking.
export function defineConfig(config: BuilderConfig): BuilderConfig {
  return config
}
