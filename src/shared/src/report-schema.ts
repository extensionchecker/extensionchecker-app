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

export const AnalysisReportSchema = z.object({
  reportVersion: z.literal('1.0.0'),
  analyzedAt: z.string().datetime(),
  source: AnalysisSourceSchema,
  metadata: ExtensionMetadataSchema,
  permissions: PermissionSummarySchema,
  riskSignals: z.array(RiskSignalSchema),
  score: RiskScoreSchema,
  summary: z.string().min(1),
  limits: AnalysisLimitsSchema
});

export type AnalysisSource = z.infer<typeof AnalysisSourceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type RiskSignal = z.infer<typeof RiskSignalSchema>;
export type PermissionSummary = z.infer<typeof PermissionSummarySchema>;
export type AnalysisLimits = z.infer<typeof AnalysisLimitsSchema>;
export type RiskScore = z.infer<typeof RiskScoreSchema>;
export type ExtensionMetadata = z.infer<typeof ExtensionMetadataSchema>;
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
