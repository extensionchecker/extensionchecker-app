import { z } from 'zod';

export const AnalyzeRequestSchema = z.object({
  source: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('url'),
      value: z.string().url()
    }),
    z.object({
      type: z.literal('id'),
      value: z.string().min(1).max(256)
    })
  ])
});

export const ManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  manifest_version: z.number().int().min(2).max(3),
  permissions: z.array(z.string()).optional(),
  optional_permissions: z.array(z.string()).optional(),
  host_permissions: z.array(z.string()).optional(),
  content_scripts: z.array(
    z.object({
      matches: z.array(z.string()).optional(),
      js: z.array(z.string()).optional()
    })
  ).optional(),
  externally_connectable: z.object({
    matches: z.array(z.string()).optional(),
    ids: z.array(z.string()).optional()
  }).optional(),
  description: z.string().optional(),
  short_name: z.string().optional(),
  author: z.union([z.string(), z.object({ email: z.string().optional() })]).optional(),
  developer: z.object({
    name: z.string().optional(),
    url: z.string().optional()
  }).optional(),
  homepage_url: z.string().optional(),
  icons: z.record(z.string(), z.string()).optional()
});

export type ManifestCandidate = {
  name?: unknown;
  version?: unknown;
  manifest_version?: unknown;
  permissions?: unknown;
  optional_permissions?: unknown;
  host_permissions?: unknown;
  content_scripts?: unknown;
  externally_connectable?: unknown;
};

export type AnalyzeSource = { type: 'url'; value: string } | { type: 'id'; value: string };
export type UploadSource = { type: 'file'; filename: string; mimeType: string };
export type ReportSource = AnalyzeSource | UploadSource;
