import path from 'node:path'
import chokidar from 'chokidar'
import type { BuilderConfig } from './config.js'
import { build } from './builder.js'
import { clearTemplateCache } from './template.js'

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

  // Start file watchers
  const contentDir = path.resolve(config.contentDir ?? 'content')
  const templatePath = config.templatePath ? path.resolve(config.templatePath) : null
  const homepageTemplatePath = config.homepageTemplatePath
    ? path.resolve(config.homepageTemplatePath)
    : null

  const watchedPaths: string[] = [contentDir]
  if (templatePath) {
    const templateDir = path.dirname(templatePath)
    if (!watchedPaths.includes(templateDir)) {
      watchedPaths.push(templateDir)
    }
  }
  if (homepageTemplatePath) {
    const homepageTemplateDir = path.dirname(homepageTemplatePath)
    if (!watchedPaths.includes(homepageTemplateDir)) {
      watchedPaths.push(homepageTemplateDir)
    }
  }

  console.log('Watching directories:', watchedPaths)

  const watcher = chokidar.watch(watchedPaths, {
    ignoreInitial: true,
    persistent: true,
  })

  let isBuilding = false
  let shouldRebuild = false

  const queueBuild = (filePath?: string): void => {
    // Clear template cache if a template file changed
    if (filePath) {
      const resolvedPath = path.resolve(filePath)
      if (resolvedPath === templatePath || resolvedPath === homepageTemplatePath) {
        clearTemplateCache()
      }
    }

    if (isBuilding) {
      shouldRebuild = true
      return
    }
    isBuilding = true
    console.log('Rebuilding...')
    build(config)
      .then(() => {
        console.log('Build completed successfully.')
      })
      .catch((error) => {
        console.error('Build failed:', error instanceof Error ? error.message : String(error))
        if (error instanceof Error && error.stack) {
          console.error(error.stack)
        }
      })
      .finally(() => {
        isBuilding = false
        if (shouldRebuild) {
          shouldRebuild = false
          queueBuild()
        }
      })
  }

  const shouldTriggerBuild = (filePath: string): boolean => {
    const resolved = path.resolve(filePath)
    const ext = path.extname(resolved)

    // Watch markdown files in content directory (including subdirectories)
    if (ext === '.md') {
      const contentDirNormalized = path.resolve(contentDir)
      const resolvedNormalized = path.resolve(resolved)
      const relative = path.relative(contentDirNormalized, resolvedNormalized)
      // Check that the file is within the content directory (not outside)
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        return true
      }
    }

    // Watch template files
    if (templatePath && resolved === templatePath) {
      return true
    }
    if (homepageTemplatePath && resolved === homepageTemplatePath) {
      return true
    }

    return false
  }

  watcher
    .on('add', (filePath) => {
      if (shouldTriggerBuild(filePath)) {
        console.log(`File added: ${filePath}`)
        queueBuild(filePath)
      }
    })
    .on('change', (filePath) => {
      if (shouldTriggerBuild(filePath)) {
        console.log(`File changed: ${filePath}`)
        queueBuild(filePath)
      }
    })
    .on('unlink', (filePath) => {
      if (shouldTriggerBuild(filePath)) {
        console.log(`File removed: ${filePath}`)
        queueBuild(filePath)
      }
    })
    .on('error', (error) => {
      console.error('Watcher error:', error)
    })
    .on('ready', () => {
      console.log('File watcher ready. Watching for changes to markdown files and templates...')
    })

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

