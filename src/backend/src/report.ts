import { z } from 'zod';
import { analyzeManifest, computeStoreTrustScore, computeCompositeScore, toSeverity, capScore, aggregateCodeFindings } from '@extensionchecker/engine';
import type { CodeScanResult } from '@extensionchecker/engine';
import { AnalysisReportSchema, type StoreMetadata, type AnalysisLimits } from '@extensionchecker/shared';
import { ManifestSchema, type ReportSource } from './schemas';
import type { StoreDataResult } from './scrapers/types';

/** Returns true when a manifest string value is an i18n message placeholder. */
function isLocalizationPlaceholder(value: string): boolean {
  return /^__MSG_[A-Za-z0-9_]+__$/.test(value.trim());
}

/** Returns true only for safe, absolute HTTPS URLs (no private IP ranges, etc.). */
function isSafeHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractStoreMetadata(manifest: z.infer<typeof ManifestSchema>, packageSizeBytes: number, storeUrl: string | null): StoreMetadata {
  const meta: StoreMetadata = {};

  // Skip i18n placeholders - they are unresolved message keys, not real descriptions.
  if (manifest.description && !isLocalizationPlaceholder(manifest.description)) {
    meta.description = manifest.description;
  }

  if (manifest.short_name) {
    meta.shortName = manifest.short_name;
  }

  if (typeof manifest.author === 'string' && manifest.author.length > 0) {
    meta.author = manifest.author;
  } else if (typeof manifest.author === 'object' && manifest.author?.email) {
    meta.author = manifest.author.email;
  }

  if (manifest.developer?.name) {
    meta.developerName = manifest.developer.name;
  }

  if (manifest.developer?.url) {
    meta.developerUrl = manifest.developer.url;
  }

  if (manifest.homepage_url) {
    meta.homepageUrl = manifest.homepage_url;
  }

  if (packageSizeBytes > 0) {
    meta.packageSizeBytes = packageSizeBytes;
  }

  if (storeUrl) {
    meta.storeUrl = storeUrl;
  }

  return meta;
}

export function resolveStoreUrl(source: ReportSource): string | null {
  if (source.type === 'url') {
    try {
      const parsed = new URL(source.value);
      if (parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch { /* ignore */ }
  }

  if (source.type === 'id') {
    const raw = source.value.trim();

    if (/^[a-p]{32}$/.test(raw)) {
      return `https://chromewebstore.google.com/detail/${raw}`;
    }

    if (raw.startsWith('chrome:')) {
      const id = raw.replace(/^chrome:/, '');
      if (/^[a-p]{32}$/.test(id)) {
        return `https://chromewebstore.google.com/detail/${id}`;
      }
    }

    if (raw.startsWith('edge:')) {
      const id = raw.replace(/^edge:/, '');
      if (/^[a-p]{32}$/.test(id)) {
        return `https://microsoftedge.microsoft.com/addons/detail/${id}`;
      }
    }

    if (raw.startsWith('firefox:')) {
      const slug = raw.replace(/^firefox:/, '');
      if (slug) {
        return `https://addons.mozilla.org/firefox/addon/${encodeURIComponent(slug)}/`;
      }
    }
  }

  return null;
}

function formatBytesCompact(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function buildLimits(codeScanResult: CodeScanResult | undefined): AnalysisLimits {
  if (!codeScanResult || codeScanResult.filesScanned === 0) {
    const notes: string[] = [
      'Manifest-first analysis only.',
      'No code-level pattern scan was performed for this extension.',
      'No dynamic execution or full source-code semantic analysis was performed.'
    ];

    return {
      codeExecutionAnalysisPerformed: false,
      codeAnalysisMode: 'none',
      codeAnalysisFilesScanned: 0,
      codeAnalysisFilesSkipped: codeScanResult?.filesSkipped ?? 0,
      codeAnalysisBytesScanned: 0,
      codeAnalysisBudgetExhausted: codeScanResult?.budgetExhausted ?? false,
      notes
    };
  }

  const notes: string[] = [
    `Lite pattern-based code scan: ${codeScanResult.filesScanned} file(s) analyzed (${formatBytesCompact(codeScanResult.bytesScanned)}).`
  ];

  if (codeScanResult.filesSkipped > 0) {
    notes.push(
      `${codeScanResult.filesSkipped} file(s) were not scanned: exceeded per-file or total scan budget.`
    );
  }

  if (codeScanResult.budgetExhausted) {
    notes.push('Scan budget was reached before all files could be analyzed. Results reflect a partial scan.');
  }

  notes.push('No dynamic execution or full source-code semantic analysis was performed.');

  return {
    codeExecutionAnalysisPerformed: true,
    codeAnalysisMode: 'lite',
    codeAnalysisFilesScanned: codeScanResult.filesScanned,
    codeAnalysisFilesSkipped: codeScanResult.filesSkipped,
    codeAnalysisBytesScanned: codeScanResult.bytesScanned,
    codeAnalysisBudgetExhausted: codeScanResult.budgetExhausted,
    notes
  };
}

export function buildReportFromManifest(
  manifestRaw: unknown,
  source: ReportSource,
  packageSizeBytes: number,
  storeResult: StoreDataResult = { attempted: false },
  codeScanResult?: CodeScanResult
) {
  const parsedManifest = ManifestSchema.safeParse(manifestRaw);
  if (!parsedManifest.success) {
    return {
      ok: false as const,
      response: new Response(JSON.stringify({ error: 'manifest.json is missing required fields or has invalid structure.' }), {
        status: 400,
        headers: {
          'content-type': 'application/json'
        }
      })
    };
  }

  const report = analyzeManifest(parsedManifest.data, source);
  const storeUrl = resolveStoreUrl(source);
  const storeMetadata = extractStoreMetadata(parsedManifest.data, packageSizeBytes, storeUrl);

  // Merge scraped store data into storeMetadata when the fetch succeeded.
  if (storeResult.attempted && storeResult.data !== null) {
    const { rating, ratingCount, userCount, description, developerUrl, homepageUrl } = storeResult.data;
    if (rating !== undefined) storeMetadata.rating = rating;
    if (ratingCount !== undefined) storeMetadata.ratingCount = ratingCount;
    if (userCount !== undefined) storeMetadata.userCount = userCount;
    // Fill description from scraped store listing when manifest lacks a real one.
    if (description && !storeMetadata.description) storeMetadata.description = description;
    // Fill developer/homepage URLs from scraped listing when not in manifest.
    if (developerUrl && !storeMetadata.developerUrl && isSafeHttpsUrl(developerUrl)) {
      storeMetadata.developerUrl = developerUrl;
    }
    if (homepageUrl && !storeMetadata.homepageUrl && isSafeHttpsUrl(homepageUrl)) {
      storeMetadata.homepageUrl = homepageUrl;
    }
  }

  // Aggregate code scan findings into signals and a score contribution.
  const codeAggregate = codeScanResult && codeScanResult.findings.length > 0
    ? aggregateCodeFindings(codeScanResult.findings)
    : { signals: [], score: 0 };

  // Merge manifest signals with code scan signals.
  const allRiskSignals = [...report.riskSignals, ...codeAggregate.signals];

  // Capability score = manifest permissions score + code scan score impact (capped at 100).
  const manifestPermissionsScore = report.permissionsScore ?? report.score.value;
  const permissionsScore = capScore(manifestPermissionsScore + codeAggregate.score);

  // Compute composite score when store trust signals (rating or user count) are present.
  const storeTrustScore = computeStoreTrustScore(storeMetadata.rating, storeMetadata.userCount);

  let overallScore: number;
  let scoringBasis: 'manifest-only' | 'manifest-and-store' | 'manifest-and-store-cached' | 'manifest-store-unavailable';
  let storeDataCachedAt: string | undefined;

  if (!storeResult.attempted) {
    // File upload, Safari, or scraper explicitly disabled - no store context.
    overallScore = permissionsScore;
    scoringBasis = 'manifest-only';
  } else if (storeResult.data !== null && storeTrustScore !== null) {
    // Scrape (or cache fallback) produced usable trust signals.
    overallScore = computeCompositeScore(permissionsScore, storeTrustScore);
    // Distinguish fresh vs cached so the UI can surface a staleness note.
    if ('fromCache' in storeResult && storeResult.fromCache) {
      scoringBasis = 'manifest-and-store-cached';
      storeDataCachedAt = storeResult.scrapedAt;
    } else {
      scoringBasis = 'manifest-and-store';
    }
  } else {
    // Scrape was attempted but failed with no cache fallback available.
    overallScore = permissionsScore;
    scoringBasis = 'manifest-store-unavailable';
  }

  const overallSeverity = toSeverity(overallScore);

  const enrichedReport = {
    ...report,
    riskSignals: allRiskSignals,
    score: {
      value: overallScore,
      severity: overallSeverity,
      rationale: scoringBasis === 'manifest-and-store' || scoringBasis === 'manifest-and-store-cached'
        ? 'Score combines the capability footprint from the manifest with store trust signals (rating and user count).'
        : scoringBasis === 'manifest-store-unavailable'
        ? 'Score reflects the capability footprint declared in the extension manifest. Store metadata was unavailable at scan time.'
        : 'Score reflects the capability footprint declared in the extension manifest. No store trust data was available.'
    },
    permissionsScore,
    ...(storeTrustScore !== null ? { storeTrustScore } : {}),
    scoringBasis,
    ...(storeDataCachedAt !== undefined ? { storeDataCachedAt } : {}),
    storeMetadata,
    limits: buildLimits(codeScanResult)
  };

  const validatedReport = AnalysisReportSchema.safeParse(enrichedReport);
  if (!validatedReport.success) {
    return {
      ok: false as const,
      response: new Response(JSON.stringify({ error: 'Internal report contract violation.' }), {
        status: 500,
        headers: {
          'content-type': 'application/json'
        }
      })
    };
  }

  return {
    ok: true as const,
    report: validatedReport.data
  };
}
