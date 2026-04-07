import { z } from 'zod';
export declare const AnalysisSourceSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"url">;
    value: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"file">;
    filename: z.ZodString;
    mimeType: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"id">;
    value: z.ZodString;
}, z.core.$strip>], "type">;
export declare const SeveritySchema: z.ZodEnum<{
    low: "low";
    medium: "medium";
    high: "high";
    critical: "critical";
}>;
export declare const CodeAnalysisModeSchema: z.ZodEnum<{
    none: "none";
    lite: "lite";
    full: "full";
}>;
export declare const EvidenceSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodString;
}, z.core.$strip>;
export declare const RiskSignalSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    severity: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>;
    description: z.ZodString;
    evidence: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>>;
    scoreImpact: z.ZodNumber;
}, z.core.$strip>;
export declare const PermissionSummarySchema: z.ZodObject<{
    requestedPermissions: z.ZodArray<z.ZodString>;
    optionalPermissions: z.ZodArray<z.ZodString>;
    hostPermissions: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const AnalysisLimitsSchema: z.ZodObject<{
    codeExecutionAnalysisPerformed: z.ZodBoolean;
    codeAnalysisMode: z.ZodOptional<z.ZodEnum<{
        none: "none";
        lite: "lite";
        full: "full";
    }>>;
    codeAnalysisFilesScanned: z.ZodOptional<z.ZodNumber>;
    codeAnalysisFilesSkipped: z.ZodOptional<z.ZodNumber>;
    codeAnalysisBytesScanned: z.ZodOptional<z.ZodNumber>;
    codeAnalysisBudgetExhausted: z.ZodOptional<z.ZodBoolean>;
    notes: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare const RiskScoreSchema: z.ZodObject<{
    value: z.ZodNumber;
    severity: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>;
    rationale: z.ZodString;
}, z.core.$strip>;
export declare const ExtensionMetadataSchema: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodString;
    manifestVersion: z.ZodNumber;
}, z.core.$strip>;
export declare const StoreMetadataSchema: z.ZodObject<{
    description: z.ZodOptional<z.ZodString>;
    shortName: z.ZodOptional<z.ZodString>;
    author: z.ZodOptional<z.ZodString>;
    developerName: z.ZodOptional<z.ZodString>;
    developerUrl: z.ZodOptional<z.ZodString>;
    homepageUrl: z.ZodOptional<z.ZodString>;
    packageSizeBytes: z.ZodOptional<z.ZodNumber>;
    storeUrl: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    rating: z.ZodOptional<z.ZodNumber>;
    ratingCount: z.ZodOptional<z.ZodNumber>;
    userCount: z.ZodOptional<z.ZodNumber>;
    lastUpdated: z.ZodOptional<z.ZodString>;
    privacyPolicyUrl: z.ZodOptional<z.ZodString>;
    supportUrl: z.ZodOptional<z.ZodString>;
    screenshots: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const ScoringBasisSchema: z.ZodEnum<{
    "manifest-only": "manifest-only";
    "manifest-and-store": "manifest-and-store";
    "manifest-store-unavailable": "manifest-store-unavailable";
    "manifest-and-store-cached": "manifest-and-store-cached";
}>;
export declare const AnalysisReportSchema: z.ZodObject<{
    reportVersion: z.ZodLiteral<"1.0.0">;
    analyzedAt: z.ZodString;
    source: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"url">;
        value: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"file">;
        filename: z.ZodString;
        mimeType: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"id">;
        value: z.ZodString;
    }, z.core.$strip>], "type">;
    metadata: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
        manifestVersion: z.ZodNumber;
    }, z.core.$strip>;
    permissions: z.ZodObject<{
        requestedPermissions: z.ZodArray<z.ZodString>;
        optionalPermissions: z.ZodArray<z.ZodString>;
        hostPermissions: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    riskSignals: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        severity: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>;
        description: z.ZodString;
        evidence: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            value: z.ZodString;
        }, z.core.$strip>>;
        scoreImpact: z.ZodNumber;
    }, z.core.$strip>>;
    score: z.ZodObject<{
        value: z.ZodNumber;
        severity: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>;
        rationale: z.ZodString;
    }, z.core.$strip>;
    permissionsScore: z.ZodOptional<z.ZodNumber>;
    storeTrustScore: z.ZodOptional<z.ZodNumber>;
    summary: z.ZodString;
    limits: z.ZodObject<{
        codeExecutionAnalysisPerformed: z.ZodBoolean;
        codeAnalysisMode: z.ZodOptional<z.ZodEnum<{
            none: "none";
            lite: "lite";
            full: "full";
        }>>;
        codeAnalysisFilesScanned: z.ZodOptional<z.ZodNumber>;
        codeAnalysisFilesSkipped: z.ZodOptional<z.ZodNumber>;
        codeAnalysisBytesScanned: z.ZodOptional<z.ZodNumber>;
        codeAnalysisBudgetExhausted: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    storeMetadata: z.ZodOptional<z.ZodObject<{
        description: z.ZodOptional<z.ZodString>;
        shortName: z.ZodOptional<z.ZodString>;
        author: z.ZodOptional<z.ZodString>;
        developerName: z.ZodOptional<z.ZodString>;
        developerUrl: z.ZodOptional<z.ZodString>;
        homepageUrl: z.ZodOptional<z.ZodString>;
        packageSizeBytes: z.ZodOptional<z.ZodNumber>;
        storeUrl: z.ZodOptional<z.ZodString>;
        category: z.ZodOptional<z.ZodString>;
        rating: z.ZodOptional<z.ZodNumber>;
        ratingCount: z.ZodOptional<z.ZodNumber>;
        userCount: z.ZodOptional<z.ZodNumber>;
        lastUpdated: z.ZodOptional<z.ZodString>;
        privacyPolicyUrl: z.ZodOptional<z.ZodString>;
        supportUrl: z.ZodOptional<z.ZodString>;
        screenshots: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    scoringBasis: z.ZodOptional<z.ZodEnum<{
        "manifest-only": "manifest-only";
        "manifest-and-store": "manifest-and-store";
        "manifest-store-unavailable": "manifest-store-unavailable";
        "manifest-and-store-cached": "manifest-and-store-cached";
    }>>;
    storeDataCachedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const AnalysisProgressStepSchema: z.ZodEnum<{
    resolving: "resolving";
    downloading: "downloading";
    extracting: "extracting";
    analyzing: "analyzing";
    complete: "complete";
}>;
export declare const AnalysisProgressEventSchema: z.ZodObject<{
    step: z.ZodEnum<{
        resolving: "resolving";
        downloading: "downloading";
        extracting: "extracting";
        analyzing: "analyzing";
        complete: "complete";
    }>;
    message: z.ZodString;
    percent: z.ZodNumber;
}, z.core.$strip>;
export type AnalysisSource = z.infer<typeof AnalysisSourceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type CodeAnalysisMode = z.infer<typeof CodeAnalysisModeSchema>;
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
//# sourceMappingURL=report-schema.d.ts.map