import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type DefaultTheme } from 'vitepress';

const docsRoot = fileURLToPath(new URL('..', import.meta.url));
const repository = 'https://github.com/shari-ar/Nutrixx';
const base = process.env.GITHUB_ACTIONS === 'true' ? '/Nutrixx/' : '/';

function gitIsAvailable(): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: docsRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const sectionOrder = [
  'product',
  'architecture',
  'domain',
  'nutrition-model',
  'data',
  'engines',
  'api',
  'security-privacy',
  'quality',
  'operations',
  'decisions',
  'roadmap',
];

const sectionLabels: Record<string, string> = {
  api: 'API',
  architecture: 'Architecture',
  data: 'Data',
  decisions: 'Architecture decisions',
  domain: 'Domain',
  engines: 'Decision engines',
  'nutrition-model': 'Nutrition model',
  operations: 'Operations',
  product: 'Product',
  quality: 'Quality and evidence',
  roadmap: 'Roadmap',
  'security-privacy': 'Security and privacy',
};

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'public') return [];

    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith('.md') ? [absolutePath] : [];
  });
}

function relativeSource(absolutePath: string): string {
  return relative(docsRoot, absolutePath).replaceAll('\\', '/');
}

function pageTitle(absolutePath: string): string {
  const heading = readFileSync(absolutePath, 'utf8').match(/^#\s+(.+)$/m)?.[1];
  if (heading) return heading.replaceAll(/[`*_]/g, '').trim();

  return basename(absolutePath, '.md')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function pageLink(source: string): string {
  if (source === 'index.md') return '/';
  if (source === 'README.md') return '/documentation-governance';
  if (source.endsWith('/README.md')) {
    return `/${source.slice(0, -'README.md'.length)}`;
  }

  return `/${source.slice(0, -'.md'.length)}`;
}

function pageItem(absolutePath: string): DefaultTheme.SidebarItem {
  const source = relativeSource(absolutePath);
  return { text: pageTitle(absolutePath), link: pageLink(source) };
}

function buildSidebar(): DefaultTheme.SidebarItem[] {
  const overviewOrder = ['index.md', 'README.md', 'devops.md'];
  const rootFiles = markdownFiles(docsRoot)
    .filter((absolutePath) => !relativeSource(absolutePath).includes('/'))
    .sort((left, right) => {
      const leftSource = relativeSource(left);
      const rightSource = relativeSource(right);
      const leftIndex = overviewOrder.indexOf(leftSource);
      const rightIndex = overviewOrder.indexOf(rightSource);

      if (leftIndex !== -1 || rightIndex !== -1) {
        return (
          (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
          (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
        );
      }

      return pageTitle(left).localeCompare(pageTitle(right), 'en');
    });

  const overview: DefaultTheme.SidebarItem = {
    text: 'Overview',
    collapsed: false,
    items: rootFiles.map(pageItem),
  };

  const discoveredSections = readdirSync(docsRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        entry.name !== 'public' &&
        !sectionOrder.includes(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));

  const sections = [...sectionOrder, ...discoveredSections].map((section) => {
    const files = markdownFiles(join(docsRoot, section)).sort((left, right) => {
      const leftIsIndex = basename(left) === 'README.md';
      const rightIsIndex = basename(right) === 'README.md';
      if (leftIsIndex !== rightIsIndex) return leftIsIndex ? -1 : 1;
      return pageTitle(left).localeCompare(pageTitle(right), 'en');
    });

    return {
      text:
        sectionLabels[section] ??
        section
          .replaceAll('-', ' ')
          .replace(/\b\w/g, (character) => character.toUpperCase()),
      collapsed: true,
      items: files.map(pageItem),
    } satisfies DefaultTheme.SidebarItem;
  });

  return [overview, ...sections];
}

function buildRewrites(): Record<string, string> {
  const rewrites: Record<string, string> = {
    'README.md': 'documentation-governance.md',
  };

  for (const absolutePath of markdownFiles(docsRoot)) {
    const source = relativeSource(absolutePath);
    if (source.endsWith('/README.md')) {
      rewrites[source] = source.replace(/README\.md$/, 'index.md');
    }
  }

  return rewrites;
}

export default defineConfig({
  lang: 'en-US',
  title: 'Nutrixx Docs',
  titleTemplate: ':title · Nutrixx Docs',
  description:
    'The technical source of truth for the Nutrixx personalized nutrition platform.',
  base,
  cleanUrls: true,
  srcExclude: ['public/README.md'],
  lastUpdated: gitIsAvailable(),
  rewrites: buildRewrites(),
  ignoreDeadLinks: 'localhostLinks',
  sitemap: {
    hostname: 'https://shari-ar.github.io/Nutrixx/',
  },
  head: [
    [
      'link',
      { rel: 'icon', type: 'image/png', href: `${base}nutrixx-mark.png` },
    ],
    ['meta', { name: 'theme-color', content: '#0b1f3a' }],
    [
      'meta',
      { property: 'og:site_name', content: 'Nutrixx Technical Documentation' },
    ],
  ],
  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
  },
  themeConfig: {
    logo: '/nutrixx-mark.png',
    siteTitle: 'Nutrixx Docs',
    nav: [
      { text: 'Product', link: '/product/' },
      { text: 'Architecture', link: '/architecture/' },
      { text: 'Domain', link: '/domain/' },
      {
        text: 'Reference',
        items: [
          { text: 'Nutrition model', link: '/nutrition-model/' },
          { text: 'Data', link: '/data/' },
          { text: 'Decision engines', link: '/engines/' },
          { text: 'API', link: '/api/' },
          { text: 'Quality and evidence', link: '/quality/' },
          { text: 'Security and privacy', link: '/security-privacy/' },
          { text: 'Operations', link: '/operations/' },
        ],
      },
      { text: 'Roadmap', link: '/roadmap/' },
    ],
    sidebar: buildSidebar(),
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'On this page' },
    editLink: {
      pattern: `${repository}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    lastUpdated: {
      text: 'Last updated',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    },
    docFooter: {
      prev: 'Previous',
      next: 'Next',
    },
    socialLinks: [{ icon: 'github', link: repository }],
    externalLinkIcon: true,
    footer: {
      message: 'Technical source of truth for Nutrixx.',
      copyright: 'Copyright © Nutrixx',
    },
  },
});
