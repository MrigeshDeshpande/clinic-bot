// Path alias resolver for @/ → src/ during replay tests.
// Usage: node --experimental-loader ./tests/replay/path-loader.js tests/replay/runner.js
import { resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';

const projectRoot = resolvePath(fileURLToPath(new URL('.', import.meta.url)), '../..');
const srcDir = resolvePath(projectRoot, 'src');

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const actualPath = resolvePath(srcDir, specifier.slice(2));
    return nextResolve(actualPath + (actualPath.endsWith('.js') ? '' : '.js'), context);
  }
  return nextResolve(specifier, context);
}
