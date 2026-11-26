import { test, expect, describe } from 'bun:test'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { CliError, loadConfig, parseCliArgs } from './cli.js'
import { defineConfig } from './index.js'

const FIXTURES = path.resolve(import.meta.dir, '../test/fixtures')
const CLI = path.resolve(import.meta.dir, 'cli.ts')

describe('parseCliArgs', () => {
  test('help for no arguments, --help, -h and help', () => {
    for (const argv of [[], ['--help'], ['-h'], ['help'], ['build', '--help'], ['dev', '-h']]) {
      expect(parseCliArgs(argv, {})).toEqual({ command: 'help' })
    }
  })

  test('build defaults', () => {
    expect(parseCliArgs(['build'], {})).toEqual({
      command: 'build',
      configPath: 'smb.config.ts',
      clean: false,
      skipLinkCheck: false,
    })
  })

  test('build flags and --config', () => {
    expect(parseCliArgs(['build', '--clean', '--skip-link-check', '--config', 'site.ts'], {})).toEqual({
      command: 'build',
      configPath: 'site.ts',
      clean: true,
      skipLinkCheck: true,
    })
  })

  test('dev port: flag, then $PORT, then 4173', () => {
    expect(parseCliArgs(['dev', '--port', '3000'], { PORT: '5000' })).toMatchObject({ port: 3000 })
    expect(parseCliArgs(['dev'], { PORT: '5000' })).toMatchObject({ port: 5000 })
    expect(parseCliArgs(['dev'], {})).toMatchObject({ command: 'dev', port: 4173, clean: false })
    expect(parseCliArgs(['dev', '--clean'], {})).toMatchObject({ clean: true })
  })

  test('rejects an invalid port', () => {
    expect(() => parseCliArgs(['dev', '--port', 'abc'], {})).toThrow(CliError)
    expect(() => parseCliArgs(['dev'], { PORT: '99999' })).toThrow('Invalid port: 99999')
    expect(() => parseCliArgs(['dev', '--port', ''], { PORT: '5000' })).toThrow('Invalid port: ')
    expect(() => parseCliArgs(['dev', '--port', '1e3'], {})).toThrow('Invalid port: 1e3')
  })

  test('an empty $PORT falls back to 4173', () => {
    expect(parseCliArgs(['dev'], { PORT: '' })).toMatchObject({ port: 4173 })
  })

  test('rejects an unknown command', () => {
    expect(() => parseCliArgs(['deploy'], {})).toThrow('Unknown command: deploy')
  })

  test('rejects unknown flags, including flags of the other command', () => {
    expect(() => parseCliArgs(['build', '--watch'], {})).toThrow(CliError)
    expect(() => parseCliArgs(['build', '--port', '3000'], {})).toThrow(CliError)
    expect(() => parseCliArgs(['dev', '--skip-link-check'], {})).toThrow(CliError)
  })

  test('rejects positional arguments', () => {
    expect(() => parseCliArgs(['build', 'extra'], {})).toThrow(CliError)
  })
})

describe('loadConfig', () => {
  test('loads smb.config.ts from the working directory by default', async () => {
    const config = await loadConfig('smb.config.ts', path.join(FIXTURES, 'site'))
    expect(config.baseUrl).toBe('https://fixture.example.com')
  })

  test('loads a config from a --config path', async () => {
    const config = await loadConfig(path.join(FIXTURES, 'configs/custom.ts'))
    expect(config.baseUrl).toBe('https://custom.example.com')
  })

  test('errors on a missing config file', async () => {
    await expect(loadConfig('missing.config.ts', FIXTURES)).rejects.toThrow('Config file not found')
  })

  test('errors on a config without a default export', async () => {
    await expect(loadConfig(path.join(FIXTURES, 'configs/no-default.ts'))).rejects.toThrow('no default export')
  })

  test('errors on a default export that is not a config object', async () => {
    await expect(loadConfig(path.join(FIXTURES, 'configs/function-default.ts'))).rejects.toThrow(
      'must default-export a config object',
    )
  })
})

test('defineConfig returns its argument', () => {
  const config = { baseUrl: 'https://x', templatePath: 't', defaultMeta: {} as never }
  expect(defineConfig(config)).toBe(config)
})

describe('smb binary', () => {
  const run = (args: string[]) => Bun.spawnSync(['bun', CLI, ...args], { cwd: FIXTURES })

  test('--help prints usage and exits 0', () => {
    const result = run(['--help'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain('Usage: smb <command>')
  })

  test('exits 1 with a one-line message on errors', () => {
    for (const [args, message] of [
      [['deploy'], 'Unknown command: deploy'],
      [['build', '--bogus'], "Unknown option '--bogus'"],
      [['build'], 'Config file not found'],
    ] as const) {
      const result = run([...args])
      expect(result.exitCode).toBe(1)
      const stderr = result.stderr.toString().trim()
      expect(stderr).toContain(message)
      expect(stderr.split('\n')).toHaveLength(1)
    }
  })

  test('build renders the fixture site', () => {
    const cwd = path.join(FIXTURES, 'site')
    rmSync(path.join(cwd, 'docs'), { recursive: true, force: true })
    const result = Bun.spawnSync(['bun', CLI, 'build'], { cwd })
    expect(result.exitCode).toBe(0)
    expect(existsSync(path.join(cwd, 'docs/index.html'))).toBe(true)
    expect(existsSync(path.join(cwd, 'docs/about.html'))).toBe(true)
  })
})
