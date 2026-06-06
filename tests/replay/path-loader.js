// Path alias resolver for @/ → src/ during replay tests.
// Usage: node --experimental-loader ./tests/replay/path-loader.js tests/replay/runner.js
import { resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { accessSync } from 'fs';

const projectRoot = resolvePath(fileURLToPath(new URL('.', import.meta.url)), '../..');
const srcDir = resolvePath(projectRoot, 'src');

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    let actualPath = resolvePath(srcDir, specifier.slice(2));
    // Try exact path + .js first
    if (!actualPath.endsWith('.js')) {
      actualPath += '.js';
    }
    // If file doesn't exist, try /index.js (directory import)
    try {
      accessSync(actualPath);
    } catch {
      const dirPath = actualPath.slice(0, -3);
      actualPath = resolvePath(dirPath, 'index.js');
    }
    return nextResolve(actualPath, context);
  }
  return nextResolve(specifier, context);
}
