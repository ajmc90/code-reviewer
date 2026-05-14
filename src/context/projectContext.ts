import * as fs from 'fs';
import * as path from 'path';
import { ProjectContext } from '../types';

/**
 * Sniffs the workspace root for clues about language, frameworks, test
 * libraries and build tooling so prompts can be tailored to the project.
 * Designed to recognize anything — TS, Go, Rust, Python, Java, .NET, Ruby,
 * PHP, Elixir, Swift, Kotlin, C/C++, Dart, etc.
 */
export async function detectProjectContext(root: string): Promise<ProjectContext> {
  const exists = (rel: string) => fs.existsSync(path.join(root, rel));
  const readSafe = (rel: string) => {
    try {
      return fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      return '';
    }
  };

  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const testFrameworks = new Set<string>();
  const buildTools = new Set<string>();
  const packageManagers = new Set<string>();

  // JS / TS
  if (exists('package.json')) {
    languages.add('JavaScript');
    const pkg = safeParse(readSafe('package.json'));
    if (pkg) {
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (deps.typescript || exists('tsconfig.json')) languages.add('TypeScript');
      if (deps.react) frameworks.add('React');
      if (deps.next) frameworks.add('Next.js');
      if (deps.vue) frameworks.add('Vue');
      if (deps.svelte) frameworks.add('Svelte');
      if (deps['@angular/core']) frameworks.add('Angular');
      if (deps.express) frameworks.add('Express');
      if (deps.fastify) frameworks.add('Fastify');
      if (deps.nestjs || deps['@nestjs/core']) frameworks.add('NestJS');
      if (deps.jest) testFrameworks.add('Jest');
      if (deps.vitest) testFrameworks.add('Vitest');
      if (deps.mocha) testFrameworks.add('Mocha');
      if (deps.playwright || deps['@playwright/test']) testFrameworks.add('Playwright');
      if (deps.cypress) testFrameworks.add('Cypress');
    }
  }
  if (exists('pnpm-lock.yaml')) packageManagers.add('pnpm');
  if (exists('yarn.lock')) packageManagers.add('yarn');
  if (exists('package-lock.json')) packageManagers.add('npm');
  if (exists('bun.lockb')) packageManagers.add('bun');

  // Python
  if (exists('pyproject.toml') || exists('requirements.txt') || exists('setup.py')) {
    languages.add('Python');
    const py = readSafe('pyproject.toml') + readSafe('requirements.txt');
    if (/fastapi/i.test(py)) frameworks.add('FastAPI');
    if (/django/i.test(py)) frameworks.add('Django');
    if (/flask/i.test(py)) frameworks.add('Flask');
    if (/pytest/i.test(py)) testFrameworks.add('pytest');
  }

  // Go
  if (exists('go.mod')) {
    languages.add('Go');
    buildTools.add('go');
    const gomod = readSafe('go.mod');
    if (/gin-gonic\/gin/.test(gomod)) frameworks.add('Gin');
    if (/labstack\/echo/.test(gomod)) frameworks.add('Echo');
  }

  // Rust
  if (exists('Cargo.toml')) {
    languages.add('Rust');
    buildTools.add('cargo');
    const cargo = readSafe('Cargo.toml');
    if (/axum/.test(cargo)) frameworks.add('Axum');
    if (/actix-web/.test(cargo)) frameworks.add('Actix Web');
    if (/rocket/.test(cargo)) frameworks.add('Rocket');
  }

  // Java / Kotlin
  if (exists('pom.xml')) {
    languages.add('Java');
    buildTools.add('Maven');
    if (/spring-boot/.test(readSafe('pom.xml'))) frameworks.add('Spring Boot');
  }
  if (exists('build.gradle') || exists('build.gradle.kts')) {
    buildTools.add('Gradle');
    const g = readSafe('build.gradle') + readSafe('build.gradle.kts');
    if (/kotlin/i.test(g)) languages.add('Kotlin');
    if (/spring-boot/.test(g)) frameworks.add('Spring Boot');
  }

  // .NET
  if (exists('Program.cs') || fs.readdirSync(root).some((f) => f.endsWith('.csproj'))) {
    languages.add('C#');
    buildTools.add('dotnet');
    frameworks.add('.NET');
  }

  // Ruby
  if (exists('Gemfile')) {
    languages.add('Ruby');
    if (/rails/.test(readSafe('Gemfile'))) frameworks.add('Rails');
    if (/rspec/.test(readSafe('Gemfile'))) testFrameworks.add('RSpec');
  }

  // PHP
  if (exists('composer.json')) {
    languages.add('PHP');
    const c = readSafe('composer.json');
    if (/laravel/i.test(c)) frameworks.add('Laravel');
    if (/symfony/i.test(c)) frameworks.add('Symfony');
    if (/phpunit/i.test(c)) testFrameworks.add('PHPUnit');
  }

  // Elixir
  if (exists('mix.exs')) {
    languages.add('Elixir');
    if (/phoenix/i.test(readSafe('mix.exs'))) frameworks.add('Phoenix');
  }

  // Swift / iOS
  if (exists('Package.swift') || fs.readdirSync(root).some((f) => f.endsWith('.xcodeproj'))) {
    languages.add('Swift');
  }

  // Dart / Flutter
  if (exists('pubspec.yaml')) {
    languages.add('Dart');
    if (/flutter/i.test(readSafe('pubspec.yaml'))) frameworks.add('Flutter');
  }

  // Conventions
  const conventionsFiles: string[] = [];
  for (const f of ['CLAUDE.md', 'README.md', 'CONTRIBUTING.md', 'ARCHITECTURE.md', 'STYLE.md']) {
    if (exists(f)) conventionsFiles.push(f);
  }

  const monorepo =
    exists('pnpm-workspace.yaml') ||
    exists('lerna.json') ||
    exists('nx.json') ||
    exists('turbo.json') ||
    (exists('package.json') && /"workspaces"/.test(readSafe('package.json')));

  return {
    rootPath: root,
    language: [...languages],
    frameworks: [...frameworks],
    packageManagers: [...packageManagers],
    testFrameworks: [...testFrameworks],
    buildTools: [...buildTools],
    conventionsFiles,
    hasCLAUDEmd: exists('CLAUDE.md'),
    monorepo,
    branchProtections: [],
  };
}

export function readConventions(root: string, files: string[], maxBytes = 30000): string {
  const parts: string[] = [];
  let total = 0;
  for (const file of files) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    try {
      const content = fs.readFileSync(p, 'utf8');
      const snippet = content.length > 8000 ? content.slice(0, 8000) + '\n... (truncated)' : content;
      parts.push(`### ${file}\n${snippet}`);
      total += snippet.length;
      if (total > maxBytes) break;
    } catch {
      // ignore
    }
  }
  return parts.join('\n\n');
}

function safeParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
