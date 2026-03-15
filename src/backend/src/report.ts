import { z } from 'zod';
import { analyzeManifest, computeStoreTrustScore, computeCompositeScore, toSeverity } from '@extensionchecker/engine';
import { AnalysisReportSchema, type StoreMetadata } from '@extensionchecker/shared';
import { ManifestSchema, type ReportSource } from './schemas';
import type { AmoStoreData } from './store-metadata';

export function extractStoreMetadata(manifest: z.infer<typeof ManifestSchema>, packageSizeBytes: number, storeUrl: string | null): StoreMetadata {
  const meta: StoreMetadata = {};

  if (manifest.description) {
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

export function buildReportFromManifest(
  manifestRaw: unknown,
  source: ReportSource,
  packageSizeBytes: number,
  amoStoreData?: AmoStoreData | null
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

  // Merge live store data from AMO when available.
  if (amoStoreData) {
    storeMetadata.rating = amoStoreData.rating;
    storeMetadata.ratingCount = amoStoreData.ratingCount;
    storeMetadata.userCount = amoStoreData.userCount;
  }

  // Compute composite score when store trust signals (rating or user count) are present.
  const permissionsScore = report.permissionsScore ?? report.score.value;
  const storeTrustScore = computeStoreTrustScore(storeMetadata.rating, storeMetadata.userCount);

  let overallScore: number;
  let scoringBasis: 'manifest-only' | 'manifest-and-store';

  if (storeTrustScore !== null) {
    overallScore = computeCompositeScore(permissionsScore, storeTrustScore);
    scoringBasis = 'manifest-and-store';
  } else {
    overallScore = permissionsScore;
    scoringBasis = 'manifest-only';
  }

  const overallSeverity = toSeverity(overallScore);

  const enrichedReport = {
    ...report,
    score: {
      value: overallScore,
      severity: overallSeverity,
      rationale: scoringBasis === 'manifest-and-store'
        ? 'Score combines the capability footprint from the manifest with store trust signals (rating and user count).'
        : 'Score reflects the capability footprint declared in the extension manifest. No store trust data was available.'
    },
    permissionsScore,
    ...(storeTrustScore !== null ? { storeTrustScore } : {}),
    scoringBasis,
    storeMetadata
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
