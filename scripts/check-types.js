#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { lint } = loadTypeCoverageCore();

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'),
);
const typeCoverageConfig = packageJson.typeCoverage ?? {};
const projects = [
  { name: 'root', configPath: path.join(repoRoot, 'tsconfig.json') },
  { name: 'tests', configPath: path.join(repoRoot, 'tests', 'tsconfig.json') },
];

let hasFailure = false;

for (const project of projects) {
  const tsOk = runTypescriptCheck(project);
  const typeCoverageOk = await runTypeCoverageCheck(project);
  hasFailure ||= !tsOk || !typeCoverageOk;
}

process.exitCode = hasFailure ? 1 : 0;

function loadTypeCoverageCore() {
  try {
    return require('type-coverage-core');
  } catch {
    const typeCoveragePackageJsonPath = require.resolve('type-coverage/package.json');
    return require(
      require.resolve('type-coverage-core', {
        paths: [path.dirname(typeCoveragePackageJsonPath)],
      }),
    );
  }
}

function runTypescriptCheck(project) {
  printSection(`TypeScript (${project.name})`);

  const parsed = parseTsConfig(project.configPath);
  if (!parsed.ok) {
    printDiagnostics(parsed.diagnostics);
    return false;
  }

  const program = ts.createProgram({
    rootNames: parsed.parsedCommandLine.fileNames,
    options: parsed.parsedCommandLine.options,
    projectReferences: parsed.parsedCommandLine.projectReferences,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length === 0) {
    console.log('OK');
    return true;
  }

  printDiagnostics(diagnostics);
  return false;
}

function parseTsConfig(configPath) {
  const diagnostics = [];
  const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        diagnostics.push(diagnostic);
      },
    },
  );

  if (!parsedCommandLine) {
    return { ok: false, diagnostics };
  }

  if (parsedCommandLine.errors.length > 0) {
    return { ok: false, diagnostics: parsedCommandLine.errors };
  }

  return { ok: true, parsedCommandLine };
}

function printDiagnostics(diagnostics) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName(fileName) {
        return fileName;
      },
      getCurrentDirectory() {
        return repoRoot;
      },
      getNewLine() {
        return ts.sys.newLine;
      },
    }),
  );
}

async function runTypeCoverageCheck(project) {
  printSection(`type-coverage (${project.name})`);

  try {
    const result = await lint(project.configPath, {
      enableCache: false,
      strict: typeCoverageConfig.strict ?? false,
      ignoreCatch: typeCoverageConfig.ignoreCatch ?? false,
      ignoreUnreadAnys: typeCoverageConfig.ignoreUnread ?? false,
      ignoreFiles: typeCoverageConfig.ignoreFiles,
      reportUnusedIgnore: typeCoverageConfig.reportUnusedIgnore,
    });
    const summary = summarizeTypeCoverage(result);
    const threshold = getCoverageThreshold(typeCoverageConfig);
    const passed = threshold === null ? true : summary.coverage >= threshold;

    console.log(
      `${summary.coverageText}% (${result.correctCount}/${result.totalCount})`,
    );

    if ((typeCoverageConfig.detail ?? false) && result.anys.length > 0) {
      printTypeCoverageDetails(result.anys);
    }

    if (passed) {
      console.log('OK');
      return true;
    }

    console.error(
      `Coverage ${summary.coverageText}% is below required ${formatPercentage(threshold)}%.`,
    );
    return false;
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    return false;
  }
}

function summarizeTypeCoverage(result) {
  if (result.totalCount === 0) {
    return { coverage: 100, coverageText: formatPercentage(100) };
  }

  const coverage = (result.correctCount / result.totalCount) * 100;
  return { coverage, coverageText: formatPercentage(coverage) };
}

function getCoverageThreshold(config) {
  if (typeof config.is === 'number') {
    return config.is;
  }

  if (typeof config.atLeast === 'number') {
    return config.atLeast;
  }

  return null;
}

function formatPercentage(value) {
  return value.toFixed(2).replace(/\.00$/, '');
}

function printTypeCoverageDetails(anys) {
  for (const anyInfo of anys) {
    console.error(
      `${anyInfo.file}:${anyInfo.line + 1}:${anyInfo.character + 1} ${anyInfo.text}`,
    );
  }
}

function printSection(title) {
  console.log(`\n${title}`);
}
