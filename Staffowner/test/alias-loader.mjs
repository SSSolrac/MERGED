import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const assetPattern = /\.(svg|png|jpe?g|gif|webp|avif|ico|bmp)$/i;

const tryFile = (candidate) => {
  try {
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
};

const resolveFile = (basePath) => {
  const hasExt = Boolean(path.extname(basePath));
  const candidates = hasExt
    ? [basePath]
    : [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        `${basePath}.jsx`,
        `${basePath}.mjs`,
        `${basePath}.cjs`,
        `${basePath}.json`,
      ];

  for (const candidate of candidates) {
    const file = tryFile(candidate);
    if (file) return file;

    // If base is a directory, attempt index.* inside it.
    try {
      if (fs.statSync(candidate).isDirectory()) {
        const indexBase = path.join(candidate, 'index');
        const indexFile = resolveFile(indexBase);
        if (indexFile) return indexFile;
      }
    } catch {}
  }

  return null;
};

const resolveAlias = (specifier) => {
  if (!specifier.startsWith('@/')) return null;
  const target = path.join(projectRoot, 'src', specifier.slice(2));
  return resolveFile(target);
};

const resolveRelative = (specifier, parentURL) => {
  if (!parentURL) return null;
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const parentPath = fileURLToPath(parentURL);
  const baseDir = path.dirname(parentPath);
  const target = path.resolve(baseDir, specifier);
  return resolveFile(target);
};

export async function resolve(specifier, context, defaultResolve) {
  if (assetPattern.test(specifier)) {
    const relativeResolved = resolveRelative(specifier, context.parentURL);
    if (relativeResolved) {
      return { url: pathToFileURL(relativeResolved).href, shortCircuit: true };
    }
    const aliasResolved = resolveAlias(specifier);
    if (aliasResolved) {
      return { url: pathToFileURL(aliasResolved).href, shortCircuit: true };
    }
  }

  const aliasResolved = resolveAlias(specifier);
  if (aliasResolved) {
    return { url: pathToFileURL(aliasResolved).href, shortCircuit: true };
  }

  const relativeResolved = resolveRelative(specifier, context.parentURL);
  if (relativeResolved) {
    return { url: pathToFileURL(relativeResolved).href, shortCircuit: true };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export function resolveSync(specifier, context, defaultResolve) {
  if (assetPattern.test(specifier)) {
    const relativeResolved = resolveRelative(specifier, context.parentURL);
    if (relativeResolved) {
      return { url: pathToFileURL(relativeResolved).href, shortCircuit: true };
    }
    const aliasResolved = resolveAlias(specifier);
    if (aliasResolved) {
      return { url: pathToFileURL(aliasResolved).href, shortCircuit: true };
    }
  }

  const aliasResolved = resolveAlias(specifier);
  if (aliasResolved) {
    return { url: pathToFileURL(aliasResolved).href, shortCircuit: true };
  }

  const relativeResolved = resolveRelative(specifier, context.parentURL);
  if (relativeResolved) {
    return { url: pathToFileURL(relativeResolved).href, shortCircuit: true };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (assetPattern.test(url)) {
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(url)};`,
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
