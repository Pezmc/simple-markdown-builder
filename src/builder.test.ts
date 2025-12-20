import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from './builder.js'

const TEST_DIR = path.join(process.cwd(), '.test-builder')

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
  await mkdir(TEST_DIR, { recursive: true })
})

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

test('build - preserves directory structure from content directory', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')

  // Create content directory structure
  await mkdir(path.join(contentDir, 'house-rules'), { recursive: true })
  await writeFile(
    path.join(contentDir, 'house-rules', 'rope-jam.md'),
    `---
slug: rope-jam
title: Rope Jam Rules
---
# Rope Jam Rules
Content here
`,
  )

  // Create a simple template
  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
  <title>{{TITLE}}</title>
  <meta name="description" content="{{DESCRIPTION}}" />
  <link rel="canonical" href="{{CANONICAL_URL}}" />
</head>
<body>{{BODY}}</body>
</html>`,
  )

  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
  }

  await build(config)

  // Verify the file was created in the correct directory structure
  const expectedPath = path.join(outputDir, 'house-rules', 'rope-jam.html')
  const exists = await readFile(expectedPath, 'utf-8').then(
    () => true,
    () => false,
  )

  expect(exists).toBe(true)
  const content = await readFile(expectedPath, 'utf-8')
  expect(content).toContain('Rope Jam Rules')
})

test('build - preserves directory structure with nested subdirectories', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')

  // Create nested directory structure
  await mkdir(path.join(contentDir, 'guides', 'advanced'), { recursive: true })
  await writeFile(
    path.join(contentDir, 'guides', 'advanced', 'techniques.md'),
    `---
slug: techniques
title: Advanced Techniques
---
# Advanced Techniques
Content here
`,
  )

  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html>
<head><title>{{TITLE}}</title></head>
<body>{{BODY}}</body>
</html>`,
  )

  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
  }

  await build(config)

  // Verify the file was created in the correct nested directory structure
  const expectedPath = path.join(outputDir, 'guides', 'advanced', 'techniques.html')
  const exists = await readFile(expectedPath, 'utf-8').then(
    () => true,
    () => false,
  )

  expect(exists).toBe(true)
})

test('build - does not preserve language directory structure', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')

  // Create language directory structure
  await mkdir(path.join(contentDir, 'fr'), { recursive: true })
  await writeFile(
    path.join(contentDir, 'fr', 'page.md'),
    `---
slug: page
title: Page FR
---
# Page FR
Content here
`,
  )

  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html>
<head><title>{{TITLE}}</title></head>
<body>{{BODY}}</body>
</html>`,
  )

  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
    translations: {
      apiKey: 'test',
      targetLanguages: ['fr'],
      defaultLang: 'en',
      supportedLangs: ['en', 'fr'],
    },
  }

  await build(config)

  // Language directories are treated specially - files go to the language subdirectory in output
  // The file should be at docs/fr/page.html (language dir is preserved in output)
  const expectedPath = path.join(outputDir, 'fr', 'page.html')
  const exists = await readFile(expectedPath, 'utf-8').then(
    () => true,
    () => false,
  )

  expect(exists).toBe(true)
})

test('build - preserves deeply nested directory structure (39c3/bla/egg.md -> 39c3/bla/egg.html)', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')

  // Create deeply nested directory structure: 39c3/bla/egg.md
  await mkdir(path.join(contentDir, '39c3', 'bla'), { recursive: true })
  await writeFile(
    path.join(contentDir, '39c3', 'bla', 'egg.md'),
    `---
slug: egg
title: Egg Page
---
# Egg Page
Content here
`,
  )

  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html lang="{{LANG}}">
<head>
  <title>{{TITLE}}</title>
  <meta name="description" content="{{DESCRIPTION}}" />
  <link rel="canonical" href="{{CANONICAL_URL}}" />
</head>
<body>{{BODY}}</body>
</html>`,
  )

  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
  }

  await build(config)

  // Verify the file was created at 39c3/bla/egg.html
  const expectedPath = path.join(outputDir, '39c3', 'bla', 'egg.html')
  const exists = await readFile(expectedPath, 'utf-8').then(
    () => true,
    () => false,
  )

  expect(exists).toBe(true)
  const content = await readFile(expectedPath, 'utf-8')
  expect(content).toContain('Egg Page')
})

test('build - preserves directory structure for root level files', async () => {
  const contentDir = path.join(TEST_DIR, 'content')
  const outputDir = path.join(TEST_DIR, 'docs')
  const templatePath = path.join(TEST_DIR, 'template.html')

  await mkdir(contentDir, { recursive: true })

  await writeFile(
    path.join(contentDir, 'index.md'),
    `---
slug: index
title: Home
---
# Home
Content here
`,
  )

  await writeFile(
    templatePath,
    `<!DOCTYPE html>
<html>
<head><title>{{TITLE}}</title></head>
<body>{{BODY}}</body>
</html>`,
  )

  const config = {
    contentDir,
    outputDir,
    templatePath,
    baseUrl: 'https://example.com',
    defaultMeta: {
      title: 'Test Site',
      description: 'Test',
      sidebarTitle: 'Test',
      sidebarSummary: 'Test',
      backLinkHref: '/',
      backLinkLabel: 'Back',
    },
  }

  await build(config)

  // Verify the file was created at root level
  const expectedPath = path.join(outputDir, 'index.html')
  const exists = await readFile(expectedPath, 'utf-8').then(
    () => true,
    () => false,
  )

  expect(exists).toBe(true)
})

