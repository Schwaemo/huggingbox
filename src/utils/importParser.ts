// Standard library modules that don't need pip install
const STDLIB = new Set([
  'abc', 'ast', 'asyncio', 'base64', 'builtins', 'collections', 'contextlib',
  'copy', 'csv', 'dataclasses', 'datetime', 'decimal', 'email', 'enum',
  'functools', 'gc', 'glob', 'gzip', 'hashlib', 'http', 'importlib',
  'inspect', 'io', 'itertools', 'json', 'logging', 'math', 'mimetypes',
  'multiprocessing', 'operator', 'os', 'pathlib', 'pickle', 'platform',
  'pprint', 'queue', 'random', 're', 'shutil', 'signal', 'socket',
  'sqlite3', 'stat', 'string', 'struct', 'subprocess', 'sys', 'tempfile',
  'textwrap', 'threading', 'time', 'timeit', 'traceback', 'typing',
  'unittest', 'urllib', 'uuid', 'warnings', 'weakref', 'xml', 'zipfile',
  'zlib', '__future__', 'typing_extensions',
]);

// Map import name → pip package name where they differ
const MODULE_TO_PACKAGE: Record<string, string> = {
  PIL: 'Pillow',
  cv2: 'opencv-python-headless',
  sklearn: 'scikit-learn',
  skimage: 'scikit-image',
  yaml: 'PyYAML',
  bs4: 'beautifulsoup4',
  dateutil: 'python-dateutil',
  attr: 'attrs',
  pkg_resources: 'setuptools',
};

/**
 * Parse all top-level module names from Python import statements.
 */
export function parseImports(code: string): string[] {
  const modules = new Set<string>();

  for (const line of code.split('\n')) {
    const trimmed = line.trim();

    // `import X`, `import X as Y`, `import X, Y`
    const importMatch = trimmed.match(/^import\s+([\w\s,]+)/);
    if (importMatch) {
      for (const part of importMatch[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) modules.add(name.split('.')[0]);
      }
    }

    // `from X import ...`
    const fromMatch = trimmed.match(/^from\s+([\w.]+)\s+import/);
    if (fromMatch) {
      modules.add(fromMatch[1].split('.')[0]);
    }
  }

  return Array.from(modules);
}

/**
 * Filter modules down to installable pip packages, skipping stdlib.
 * Returns the pip package name (handles name mismatches like PIL → Pillow).
 */
export function getInstallablePackages(modules: string[]): string[] {
  return modules
    .filter((m) => !STDLIB.has(m))
    .map((m) => MODULE_TO_PACKAGE[m] ?? m);
}
