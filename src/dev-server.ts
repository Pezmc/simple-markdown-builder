import path from 'node:path'
import chokidar from 'chokidar'
import type { BuilderConfig } from './config.js'
import { build } from './builder.js'

export interface DevServerOptions {
  readonly port?: number
  readonly outputDir?: string
  readonly refreshTranslations?: boolean
}

export async function startDevServer(
  config: BuilderConfig,
  options: DevServerOptions = {},
): Promise<void> {
  const outputDir = path.resolve(options.outputDir ?? config.outputDir ?? 'docs')
  const port = options.port ?? Number(process.env.PORT ?? 4173)

  // Ensure translations if enabled and refresh requested
  if (config.translations !== false && options.refreshTranslations) {
    const { ensureTranslations } = await import('./translations.js')
    const contentDir = path.resolve(config.contentDir ?? 'content')
    await ensureTranslations(config, contentDir, true)
  }

  // Initial build
  await build(config)

  // Start file watcher
  const contentDir = path.resolve(config.contentDir ?? 'content')
  const watcher = chokidar.watch(path.join(contentDir, '**/*.md'), {
    ignoreInitial: true,
  })

  let isBuilding = false
  let shouldRebuild = false

  const queueBuild = (): void => {
    if (isBuilding) {
      shouldRebuild = true
      return
    }
    isBuilding = true
    build(config)
      .catch((error) => {
        console.error(error)
      })
      .finally(() => {
        isBuilding = false
        if (shouldRebuild) {
          shouldRebuild = false
          queueBuild()
        }
      })
  }

  watcher.on('add', queueBuild).on('change', queueBuild).on('unlink', queueBuild)
  console.log('Watching content/ for Markdown changes...')

  // Start HTTP server
  const server = Bun.serve({
    port,
    fetch: async (request) => {
      const url = new URL(request.url)
      let pathname = decodeURIComponent(url.pathname)

      if (pathname === '/' || pathname === '') {
        pathname = '/index.html'
      } else if (pathname.endsWith('/')) {
        pathname += 'index.html'
      }

      // Try the requested path first
      const primaryPath = resolveFilePath(pathname, outputDir)
      const file = Bun.file(primaryPath)
      if (await file.exists()) {
        return new Response(file)
      }

      // If no extension, try .html and folder/index.html fallbacks
      if (!path.extname(pathname)) {
        const htmlPath = resolveFilePath(`${pathname}.html`, outputDir)
        const htmlFile = Bun.file(htmlPath)
        if (await htmlFile.exists()) {
          return new Response(htmlFile)
        }

        const fallbackPath = resolveFilePath(path.join(pathname, 'index.html'), outputDir)
        const fallbackFile = Bun.file(fallbackPath)
        if (await fallbackFile.exists()) {
          return new Response(fallbackFile)
        }
      }

      return new Response('Not found', { status: 404 })
    },
  })

  console.log(`Serving docs from ${outputDir} at http://localhost:${port}`)

  // Handle shutdown
  const shutdown = (): void => {
    server.stop()
    watcher.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

function resolveFilePath(requestPath: string, outputDir: string): string {
  const normalized = path
    .normalize(requestPath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^\/+/, '')
  return path.join(outputDir, normalized)
}

