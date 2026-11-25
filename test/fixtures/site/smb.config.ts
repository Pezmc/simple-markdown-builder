import { defineConfig } from '../../../src/index.js'

export default defineConfig({
  baseUrl: 'https://fixture.example.com',
  templatePath: 'template.html',
  defaultMeta: {
    title: 'Fixture',
    description: 'Fixture site',
    sidebarTitle: 'Fixture',
    sidebarSummary: 'A fixture site for the CLI',
    backLinkHref: '/',
    backLinkLabel: 'Back',
  },
})
