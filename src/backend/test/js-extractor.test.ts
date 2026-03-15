import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { extractJsFilesFromPackage } from '../src/js-extractor';
import type { JsExtractionOptions } from '../src/js-extractor';

/** Builds a ZIP buffer from a plain string-keyed map of file content. */
function buildZip(entries: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, content]) => [name, strToU8(content)])
    )
  );
}

const DEFAULT_OPTIONS: JsExtractionOptions = {
  maxTotalBytes: 500_000,
  maxFileBytes: 200_000,
  maxFiles: 30,
  wallClockBudgetMs: 3_000
};

const MINIMAL_MANIFEST: unknown = {
  manifest_version: 3,
  name: 'Test',
  version: '1.0.0'
};

// ---------------------------------------------------------------------------
// Basic extraction
// ---------------------------------------------------------------------------

describe('extractJsFilesFromPackage — basic extraction', () => {
  it('returns empty result for an archive with no JS files', () => {
    const zip = buildZip({ 'manifest.json': '{}', 'style.css': 'body {}', 'icon.png': 'PNG' });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, DEFAULT_OPTIONS);
    expect(result.files).toHaveLength(0);
    expect(result.filesSkipped).toBe(0);
    expect(result.budgetExhausted).toBe(false);
  });

  it('extracts a single JS file with correct path and content', () => {
    const zip = buildZip({
      'manifest.json': '{}',
      'background.js': 'chrome.runtime.onInstalled.addListener(() => {});'
    });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, DEFAULT_OPTIONS);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe('background.js');
    expect(result.files[0]?.content).toContain('chrome.runtime');
    expect(result.filesSkipped).toBe(0);
    expect(result.budgetExhausted).toBe(false);
  });

  it('extracts multiple JS files', () => {
    const zip = buildZip({
      'manifest.json': '{}',
      'background.js': 'var bg = true;',
      'content.js': 'var cs = true;',
      'popup.js': 'var popup = true;'
    });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, DEFAULT_OPTIONS);
    expect(result.files).toHaveLength(3);
  });

  it('ignores non-JS files', () => {
    const zip = buildZip({
      'manifest.json': '{}',
      'popup.html': '<html></html>',
      'styles.css': 'body {}',
      'image.png': 'PNG',
      'popup.js': 'var x = 1;'
    });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, DEFAULT_OPTIONS);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe('popup.js');
  });
});

// ---------------------------------------------------------------------------
// Manifest-based priority ordering
// ---------------------------------------------------------------------------

describe('extractJsFilesFromPackage — priority ordering', () => {
  it('places background script before alphabetically-prior non-declared files', () => {
    const manifest = {
      manifest_version: 3,
      name: 'Test',
      version: '1.0.0',
      background: { service_worker: 'service_worker.js' }
    };
    const zip = buildZip({
      'aaa.js': 'var aaa = 1;',
      'bbb.js': 'var bbb = 1;',
      'service_worker.js': 'self.addEventListener("fetch", () => {});'
    });
    // Limit to 1 file so we can verify priority
    const result = extractJsFilesFromPackage(zip, 'zip', manifest, {
      ...DEFAULT_OPTIONS,
      maxFiles: 1
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe('service_worker.js');
  });

  it('places content scripts second (after background, before unregistered files)', () => {
    const manifest = {
      manifest_version: 3,
      name: 'Test',
      version: '1.0.0',
      content_scripts: [{ js: ['injected.js'], matches: ['<all_urls>'] }]
    };
    const zip = buildZip({
      'aaa.js': 'var aaa = 1;',
      'injected.js': 'document.title = "injected";'
    });
    const result = extractJsFilesFromPackage(zip, 'zip', manifest, {
      ...DEFAULT_OPTIONS,
      maxFiles: 1
    });
    expect(result.files[0]?.path).toBe('injected.js');
  });

  it('handles MV2 background scripts array', () => {
    const manifest = {
      manifest_version: 2,
      name: 'Test',
      version: '1.0.0',
      background: { scripts: ['bg1.js', 'bg2.js'] }
    };
    const zip = buildZip({
      'zzz.js': 'var zzz = 1;',
      'bg1.js': 'var bg1 = 1;',
      'bg2.js': 'var bg2 = 1;'
    });
    const result = extractJsFilesFromPackage(zip, 'zip', manifest, {
      ...DEFAULT_OPTIONS,
      maxFiles: 2
    });
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('bg1.js');
    expect(paths).toContain('bg2.js');
    expect(paths).not.toContain('zzz.js');
  });
});

// ---------------------------------------------------------------------------
// Budget limits — maxFiles
// ---------------------------------------------------------------------------

describe('extractJsFilesFromPackage — maxFiles budget', () => {
  it('honours maxFiles: stops at the limit and marks budgetExhausted', () => {
    const zip = buildZip({
      'a.js': 'var a = 1;',
      'b.js': 'var b = 2;',
      'c.js': 'var c = 3;',
      'd.js': 'var d = 4;'
    });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, {
      ...DEFAULT_OPTIONS,
      maxFiles: 2
    });
    expect(result.files).toHaveLength(2);
    expect(result.budgetExhausted).toBe(true);
    expect(result.filesSkipped).toBeGreaterThanOrEqual(2);
  });

  it('does NOT mark budgetExhausted when files fit exactly within maxFiles', () => {
    const zip = buildZip({
      'a.js': 'var a = 1;',
      'b.js': 'var b = 2;'
    });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, {
      ...DEFAULT_OPTIONS,
      maxFiles: 2
    });
    expect(result.files).toHaveLength(2);
    expect(result.budgetExhausted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Budget limits — maxTotalBytes
// ---------------------------------------------------------------------------

describe('extractJsFilesFromPackage — maxTotalBytes budget', () => {
  it('skips files that would exceed the total byte budget', () => {
    // Each file is ~10 bytes; limit to 15 so only one can fit
    const zip = buildZip({
      'a.js': '0123456789', // 10 bytes
      'b.js': '9876543210'  // 10 bytes
    });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, {
      ...DEFAULT_OPTIONS,
      maxTotalBytes: 15
    });
    expect(result.files).toHaveLength(1);
    expect(result.budgetExhausted).toBe(true);
    expect(result.filesSkipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Budget limits — maxFileBytes
// ---------------------------------------------------------------------------

describe('extractJsFilesFromPackage — maxFileBytes budget', () => {
  it('skips individual files that exceed maxFileBytes, keeps smaller ones', () => {
    const bigContent = 'x'.repeat(300);
    const smallContent = 'var x = 1;';
    const zip = buildZip({
      'huge.js': bigContent,    // 300 bytes — over limit
      'small.js': smallContent  // 10 bytes — under limit
    });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, {
      ...DEFAULT_OPTIONS,
      maxFileBytes: 200
    });
    const paths = result.files.map((f) => f.path);
    expect(paths).not.toContain('huge.js');
    expect(paths).toContain('small.js');
    expect(result.filesSkipped).toBe(1);
    // budgetExhausted stays false when a file is skipped only for per-file limit
    // (the total budget was not reached)
    expect(result.budgetExhausted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Security — path traversal rejection
// ---------------------------------------------------------------------------

describe('extractJsFilesFromPackage — path safety', () => {
  it('returns no files when the archive is empty', () => {
    const zip = buildZip({ 'manifest.json': '{}' });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, DEFAULT_OPTIONS);
    expect(result.files).toHaveLength(0);
  });

  it('processes a deeply nested (but safe) path', () => {
    const zip = buildZip({
      'vendor/lib/deeply/nested.js': 'var x = 1;'
    });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, DEFAULT_OPTIONS);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe('vendor/lib/deeply/nested.js');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('extractJsFilesFromPackage — edge cases', () => {
  it('handles null / non-object rawManifest gracefully', () => {
    const zip = buildZip({ 'bg.js': 'var x = 1;' });
    const result = extractJsFilesFromPackage(zip, 'zip', null, DEFAULT_OPTIONS);
    // Should still extract the file — just without priority ordering
    expect(result.files).toHaveLength(1);
  });

  it('handles rawManifest with no background or content_scripts gracefully', () => {
    const zip = buildZip({ 'popup.js': 'var x = 1;' });
    const result = extractJsFilesFromPackage(zip, 'zip', { manifest_version: 3 }, DEFAULT_OPTIONS);
    expect(result.files).toHaveLength(1);
  });

  it('handles a JS file with empty content', () => {
    const zip = buildZip({ 'empty.js': '' });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, DEFAULT_OPTIONS);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.content).toBe('');
  });

  it('returns filesSkipped of 0 and budgetExhausted false for a single small file', () => {
    const zip = buildZip({ 'bg.js': 'var x = 1;' });
    const result = extractJsFilesFromPackage(zip, 'zip', MINIMAL_MANIFEST, DEFAULT_OPTIONS);
    expect(result.filesSkipped).toBe(0);
    expect(result.budgetExhausted).toBe(false);
  });
});
