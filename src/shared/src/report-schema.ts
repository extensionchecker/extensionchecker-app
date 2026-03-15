import { z } from 'zod';

export const AnalysisSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('url'),
    value: z.string().url()
  }),
  z.object({
    type: z.literal('file'),
    filename: z.string().min(1),
    mimeType: z.string().min(1)
  }),
  z.object({
    type: z.literal('id'),
    value: z.string().min(1)
  })
]);

export const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const EvidenceSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1)
});

export const RiskSignalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: SeveritySchema,
  description: z.string().min(1),
  evidence: z.array(EvidenceSchema).min(1),
  scoreImpact: z.number().int().min(0)
});

export const PermissionSummarySchema = z.object({
  requestedPermissions: z.array(z.string()),
  optionalPermissions: z.array(z.string()),
  hostPermissions: z.array(z.string())
});

export const AnalysisLimitsSchema = z.object({
  codeExecutionAnalysisPerformed: z.boolean(),
  notes: z.array(z.string())
});

export const RiskScoreSchema = z.object({
  value: z.number().int().min(0).max(100),
  severity: SeveritySchema,
  rationale: z.string().min(1)
});

export const ExtensionMetadataSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  manifestVersion: z.number().int().min(2).max(3)
});

export const StoreMetadataSchema = z.object({
  description: z.string().optional(),
  shortName: z.string().optional(),
  author: z.string().optional(),
  developerName: z.string().optional(),
  developerUrl: z.string().optional(),
  homepageUrl: z.string().optional(),
  packageSizeBytes: z.number().int().min(0).optional(),
  storeUrl: z.string().optional(),
  category: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().int().min(0).optional(),
  userCount: z.number().int().min(0).optional(),
  lastUpdated: z.string().optional(),
  privacyPolicyUrl: z.string().optional(),
  supportUrl: z.string().optional(),
  screenshots: z.array(z.string()).optional()
});

export const ScoringBasisSchema = z.enum([
  'manifest-only',
  'manifest-and-store',
  /**
   * Store scraping was attempted for this ecosystem (Chrome, Edge, Opera) but
   * the request failed - network error, rate-limit, unexpected page structure,
   * or the store returned no usable data.
   *
   * Scoring falls back to manifest-only, but the UI surfaces a grayed-out
   * "Unavailable" store donut so users understand why store signals are absent.
   */
  'manifest-store-unavailable',
  /**
   * Fresh scraping failed, but a KV-cached entry from a previous successful
   * scrape was used as a fallback. The report carries `storeDataCachedAt` so
   * the UI can show "from cache · X days ago" next to the store donut.
   */
  'manifest-and-store-cached'
]);

export const AnalysisReportSchema = z.object({
  reportVersion: z.literal('1.0.0'),
  analyzedAt: z.string().datetime(),
  source: AnalysisSourceSchema,
  metadata: ExtensionMetadataSchema,
  permissions: PermissionSummarySchema,
  riskSignals: z.array(RiskSignalSchema),
  score: RiskScoreSchema,
  permissionsScore: z.number().int().min(0).max(100).optional(),
  storeTrustScore: z.number().int().min(0).max(100).optional(),
  summary: z.string().min(1),
  limits: AnalysisLimitsSchema,
  storeMetadata: StoreMetadataSchema.optional(),
  scoringBasis: ScoringBasisSchema.optional(),
  /**
   * ISO 8601 timestamp of when store metadata was originally scraped.
   * Only present when `scoringBasis === 'manifest-and-store-cached'`.
   */
  storeDataCachedAt: z.string().datetime().optional()
});

export const AnalysisProgressStepSchema = z.enum([
  'resolving',
  'downloading',
  'extracting',
  'analyzing',
  'complete'
]);

export const AnalysisProgressEventSchema = z.object({
  step: AnalysisProgressStepSchema,
  message: z.string().min(1),
  percent: z.number().int().min(0).max(100)
});

export type AnalysisSource = z.infer<typeof AnalysisSourceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type RiskSignal = z.infer<typeof RiskSignalSchema>;
export type PermissionSummary = z.infer<typeof PermissionSummarySchema>;
export type AnalysisLimits = z.infer<typeof AnalysisLimitsSchema>;
export type RiskScore = z.infer<typeof RiskScoreSchema>;
export type ExtensionMetadata = z.infer<typeof ExtensionMetadataSchema>;
export type StoreMetadata = z.infer<typeof StoreMetadataSchema>;
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
export type ScoringBasis = z.infer<typeof ScoringBasisSchema>;
export type AnalysisProgressStep = z.infer<typeof AnalysisProgressStepSchema>;
export type AnalysisProgressEvent = z.infer<typeof AnalysisProgressEventSchema>;
