#!/usr/bin/env bun
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import type { BuilderConfig } from './config.js'

const DEFAULT_CONFIG = 'smb.config.ts'
const DEFAULT_PORT = 4173

export const USAGE = `Usage: smb <command> [options]

Commands:
  build    Build the site once
  dev      Build, watch and serve the site

Options:
  --config <path>      Config file (default: ./${DEFAULT_CONFIG})
  --clean              Remove generated HTML before building
  --skip-link-check    Skip the broken-link check (build only)
  --port <n>           Dev server port (dev only; default: $PORT, then ${DEFAULT_PORT})
  -h, --help           Show this help`

export class CliError extends Error {}

export type CliArgs =
  | { readonly command: 'help' }
  | {
      readonly command: 'build'
      readonly configPath: string
      readonly clean: boolean
      readonly skipLinkCheck: boolean
    }
  | {
      readonly command: 'dev'
      readonly configPath: string
      readonly clean: boolean
      readonly port: number
    }

const commonOptions = {
  config: { type: 'string' },
  clean: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const

const commandOptions = {
  build: { ...commonOptions, 'skip-link-check': { type: 'boolean' } },
  dev: { ...commonOptions, port: { type: 'string' } },
} as const

function parseCommandArgs<T extends keyof typeof commandOptions>(command: T, args: string[]) {
  try {
    return parseArgs({ args, options: commandOptions[command], strict: true, allowPositionals: false })
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message.split('\n')[0] : String(error))
  }
}

function parsePort(value: string | undefined, env: NodeJS.ProcessEnv): number {
  const raw = value ?? (env.PORT || undefined)
  if (raw === undefined) return DEFAULT_PORT
  const port = Number(raw)
  if (!/^\d+$/.test(raw) || port > 65535) {
    throw new CliError(`Invalid port: ${raw}`)
  }
  return port
}

export function parseCliArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): CliArgs {
  const [command, ...rest] = argv
  if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
    return { command: 'help' }
  }

  if (command === 'build') {
    const { values } = parseCommandArgs('build', rest)
    if (values.help) return { command: 'help' }
    return {
      command,
      configPath: values.config ?? DEFAULT_CONFIG,
      clean: values.clean ?? false,
      skipLinkCheck: values['skip-link-check'] ?? false,
    }
  }

  if (command === 'dev') {
    const { values } = parseCommandArgs('dev', rest)
    if (values.help) return { command: 'help' }
    return {
      command,
      configPath: values.config ?? DEFAULT_CONFIG,
      clean: values.clean ?? false,
      port: parsePort(values.port, env),
    }
  }

  throw new CliError(`Unknown command: ${command}. Run "smb --help" for usage.`)
}

export async function loadConfig(configPath: string, cwd: string = process.cwd()): Promise<BuilderConfig> {
  const absolutePath = path.resolve(cwd, configPath)
  if (!(await Bun.file(absolutePath).exists())) {
    throw new CliError(`Config file not found: ${absolutePath}`)
  }
  const mod = await import(pathToFileURL(absolutePath).href)
  if (mod.default === undefined) {
    throw new CliError(`Config file has no default export: ${absolutePath}`)
  }
  if (typeof mod.default !== 'object' || mod.default === null) {
    throw new CliError(`Config file must default-export a config object: ${absolutePath}`)
  }
  return mod.default as BuilderConfig
}

export async function run(argv: readonly string[]): Promise<void> {
  const args = parseCliArgs(argv)
  if (args.command === 'help') {
    console.log(USAGE)
    return
  }

  const config = await loadConfig(args.configPath)

  if (args.command === 'build') {
    const { build } = await import('./builder.js')
    // Flags only switch behaviour on; they never override a config that already set it.
    await build({
      ...config,
      clean: args.clean || config.clean,
      skipLinkCheck: args.skipLinkCheck || config.skipLinkCheck,
    })
    return
  }

  const { startDevServer } = await import('./dev-server.js')
  // Clean once at start; `clean: false` in the config stops every rebuild on change from wiping the output.
  await startDevServer({ ...config, clean: false }, { port: args.port, clean: args.clean || config.clean })
}

if (import.meta.main) {
  try {
    await run(process.argv.slice(2))
  } catch (error) {
    if (error instanceof CliError) {
      console.error(`smb: ${error.message}`)
      process.exit(1)
    }
    throw error
  }
}
