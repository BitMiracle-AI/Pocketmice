// Checks the workspace structure. A unit is one member of the workspace: a folder with its own package.json.
// The rules: a unit is named @pocketmice/<folder name>; apps do not depend on each other; packages and the units in
// the repo root do not depend on apps; a server-only package is depended on only by the units listed for it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCOPE = '@pocketmice/';
// Server-only packages: each one mapped to the set of units allowed to depend on it, for example
// ['@pocketmice/db', new Set(['@pocketmice/api'])]. What is in such a package must not reach code that runs on a
// client, so a new unit is not on a list by default: add it when it really needs the package. There are none yet.
const SERVER_ONLY_PACKAGES = new Map();
// Units that live directly in the repo root rather than under apps/ or packages/, by folder name. They are outside
// those two folders but follow the same naming and dependency rules. There are none yet.
const ROOT_UNITS = [];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/**
 * Checks apps/, packages/ and the root-level units under root. Returns one message for each violation, or an empty
 * array if there are none.
 * serverOnlyPackages and rootUnits default to the two lists above; the tests pass their own to exercise those rules.
 */
export function checkWorkspace(root, { serverOnlyPackages = SERVER_ONLY_PACKAGES, rootUnits = ROOT_UNITS } = {}) {
  const units = [];
  const problems = [];

  for (const { where, group, dirName } of unitDirs(root, rootUnits)) {
    const manifestPath = join(root, where, 'package.json');
    if (!existsSync(manifestPath)) {
      problems.push(`${where} has no package.json`);
      continue;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== SCOPE + dirName) {
      problems.push(`${where} must be named ${SCOPE}${dirName}, but is named ${manifest.name}`);
    }
    const deps = DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {}));
    units.push({ where, group, name: manifest.name, deps });
  }

  const appNames = new Set(units.filter((unit) => unit.group === 'apps').map((unit) => unit.name));
  for (const unit of units) {
    for (const dep of unit.deps) {
      const consumers = serverOnlyPackages.get(dep);
      if (consumers && !consumers.has(unit.name)) {
        problems.push(
          `${unit.where} must not depend on ${dep}: only the units listed in scripts/checkWorkspace.mjs may`
        );
      }
      if (!appNames.has(dep)) continue;
      problems.push(
        unit.group === 'apps'
          ? `${unit.where} depends on another app: ${dep}`
          : `${unit.where} depends on an app: ${dep}`
      );
    }
  }

  return problems;
}

/** The folder of every unit: each subfolder of apps/ and packages/, plus the ones directly in the repo root */
function unitDirs(root, rootUnits) {
  const dirs = [];

  for (const group of ['apps', 'packages']) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;

    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      dirs.push({ where: `${group}/${entry.name}`, group, dirName: entry.name });
    }
  }

  for (const name of rootUnits) {
    if (existsSync(join(root, name))) dirs.push({ where: name, group: 'root', dirName: name });
  }

  return dirs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const problems = checkWorkspace(root);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log('Workspace structure check passed');
}
