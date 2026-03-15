/**
 * Extracts JavaScript files from an extension archive for code scanning.
 *
 * Performs a two-pass approach over the ZIP:
 *   Pass 1: Catalog all JS entry names without decompressing (O(central-directory)).
 *   Pass 2: Decompress only the prioritized subset that fits within the scan budget.
 *
 * Priority order (highest first):
 *   1. Background script / service worker (persistent runtime, highest risk)
 *   2. Content scripts declared in manifest (direct DOM access)
 *   3. Web-accessible resources (.js only)
 *   4. All remaining .js files (sorted alphabetically for determinism)
 *
 * Security controls enforced before any decompression:
 *   - Entry count limit (same as archive.ts, prevents catalog-level DoS)
 *   - Path traversal rejection (../ and leading /) on every entry
 *   - Null byte rejection in filenames
 *   - Per-file compression ratio check (zip bomb protection)
 *   - Per-file and total byte budget (DoS / memory protection)
 *   - Total file count budget
 */
import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate';
import type { PackageKind } from './archive';
import { getRawZipBytes } from './archive';
import type { JsFileEntry } from '@extensionchecker/engine';

const MAX_CATALOG_ENTRIES = 5_000;
const MAX_COMPRESSION_RATIO = 1_000;

export interface JsExtractionOptions {
  maxTotalBytes: number;
  maxFileBytes: number;
  maxFiles: number;
  wallClockBudgetMs: number;
}

export interface JsExtractionResult {
  files: JsFileEntry[];
  filesSkipped: number;
  budgetExhausted: boolean;
}

interface CatalogEntry {
  name: string;
  originalSize: number;
  compressedSize: number;
}

/**
 * Determines the priority tier for a JS file path based on manifest declarations.
 * Lower numbers = higher priority.
 */
function priorityOf(name: string, priorityPaths: Set<string>): number {
  return priorityPaths.has(name) ? 0 : 1;
}

/**
 * Extracts background, content script, and web-accessible JS paths from a
 * raw (unknown-typed) manifest object. All extracted paths are sanitized.
 */
function extractManifestJsPaths(rawManifest: unknown): Set<string> {
  const paths = new Set<string>();

  if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    return paths;
  }

  const manifest = rawManifest as Record<string, unknown>;

  // MV2 background scripts / MV3 service worker
  if (manifest['background'] && typeof manifest['background'] === 'object' && !Array.isArray(manifest['background'])) {
    const bg = manifest['background'] as Record<string, unknown>;
    if (Array.isArray(bg['scripts'])) {
      for (const s of bg['scripts']) {
        if (typeof s === 'string' && s.endsWith('.js')) paths.add(s);
      }
    }

    if (typeof bg['service_worker'] === 'string' && bg['service_worker'].endsWith('.js')) {
      paths.add(bg['service_worker']);
    }
  }

  // Content scripts
  if (Array.isArray(manifest['content_scripts'])) {
    for (const cs of manifest['content_scripts']) {
      if (cs && typeof cs === 'object' && !Array.isArray(cs)) {
        const csObj = cs as Record<string, unknown>;
        if (Array.isArray(csObj['js'])) {
          for (const s of csObj['js']) {
            if (typeof s === 'string' && s.endsWith('.js')) paths.add(s);
          }
        }
      }
    }
  }

  // Web-accessible resources (MV2: string[] | MV3: { resources: string[] }[])
  if (Array.isArray(manifest['web_accessible_resources'])) {
    for (const resource of manifest['web_accessible_resources']) {
      if (typeof resource === 'string' && resource.endsWith('.js')) {
        paths.add(resource);
      } else if (resource && typeof resource === 'object' && !Array.isArray(resource)) {
        const resObj = resource as Record<string, unknown>;
        if (Array.isArray(resObj['resources'])) {
          for (const r of resObj['resources']) {
            if (typeof r === 'string' && r.endsWith('.js')) paths.add(r);
          }
        }
      }
    }
  }

  return paths;
}

function isSafeEntryName(name: string): boolean {
  if (name.includes('\0')) return false;
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return false;
  if (normalized.split('/').some((segment) => segment === '..')) return false;
  return true;
}

/**
 * Extracts JS files from a package archive, respecting budget constraints and
 * ordering by manifest-declared priority.
 */
export function extractJsFilesFromPackage(
  bytes: Uint8Array,
  packageKind: PackageKind,
  rawManifest: unknown,
  options: JsExtractionOptions
): JsExtractionResult {
  const zipBytes = getRawZipBytes(bytes, packageKind);
  const priorityPaths = extractManifestJsPaths(rawManifest);
  const startTime = Date.now();

  // Pass 1: Catalog all JS entries without decompressing.
  const catalog: CatalogEntry[] = [];
  let catalogCount = 0;

  unzipSync(zipBytes, {
    filter(file: UnzipFileInfo): boolean {
      catalogCount++;
      if (catalogCount > MAX_CATALOG_ENTRIES) return false;
      if (!isSafeEntryName(file.name)) return false;

      const normalized = file.name.replace(/\\/g, '/').toLowerCase();
      if (!normalized.endsWith('.js')) return false;

      catalog.push({
        name: file.name.replace(/\\/g, '/'),
        originalSize: file.originalSize,
        compressedSize: file.size
      });

      return false; // No decompression in pass 1
    }
  });

  // Sort: manifest-declared paths first, then alphabetical for determinism.
  catalog.sort((a, b) => {
    const pa = priorityOf(a.name, priorityPaths);
    const pb = priorityOf(b.name, priorityPaths);
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  // Select files to decompress within budget constraints.
  const wantedPaths = new Set<string>();
  let projectedBytes = 0;
  let filesSkipped = 0;
  let budgetExhausted = false;

  for (const entry of catalog) {
    if (Date.now() - startTime > options.wallClockBudgetMs) {
      budgetExhausted = true;
      filesSkipped += catalog.length - wantedPaths.size - 1;
      break;
    }

    if (wantedPaths.size >= options.maxFiles) {
      filesSkipped++;
      budgetExhausted = true;
      continue;
    }

    if (entry.originalSize > options.maxFileBytes) {
      filesSkipped++;
      continue;
    }

    if (projectedBytes + entry.originalSize > options.maxTotalBytes) {
      filesSkipped++;
      budgetExhausted = true;
      continue;
    }

    wantedPaths.add(entry.name);
    projectedBytes += entry.originalSize;
  }

  if (wantedPaths.size === 0) {
    return { files: [], filesSkipped, budgetExhausted };
  }

  // Pass 2: Decompress only the selected files.
  let pass2Count = 0;
  const decompressed = unzipSync(zipBytes, {
    filter(file: UnzipFileInfo): boolean {
      pass2Count++;
      if (pass2Count > MAX_CATALOG_ENTRIES) return false;

      const normalized = file.name.replace(/\\/g, '/');
      if (!wantedPaths.has(normalized)) return false;

      // Zip bomb guard on actual decompression
      if (file.size > 0 && file.originalSize > 0) {
        const ratio = file.originalSize / file.size;
        if (ratio > MAX_COMPRESSION_RATIO) return false;
      }

      return true;
    }
  });

  const files: JsFileEntry[] = [];
  for (const path of wantedPaths) {
    const entryBytes = decompressed[path];
    if (entryBytes === undefined) continue;

    let content: string;
    try {
      content = strFromU8(entryBytes);
    } catch {
      filesSkipped++;
      continue;
    }

    files.push({ path, content });
  }

  return { files, filesSkipped, budgetExhausted };
}
