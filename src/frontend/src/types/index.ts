import type { Severity } from '@extensionchecker/shared';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResultTab = 'overview' | 'findings' | 'metadata' | 'phases';
export type PhaseStatus = 'complete' | 'not-available';
export type Tone = 'info' | 'good' | 'caution' | 'warning' | 'danger';
export type AppRoute = 'scan' | 'results' | 'terms' | 'privacy' | 'faq';
export type IntakeTab = 'paste' | 'upload';
export type SmartSubmissionKind = 'empty' | 'url' | 'id' | 'invalid-url';
export type SubmitTarget = 'text' | 'upload' | null;
export type DetectedBrowser = 'chrome' | 'firefox' | 'edge' | 'opera' | 'safari' | 'chromium' | 'generic';

export interface SmartSubmissionState {
  kind: SmartSubmissionKind;
  normalizedValue: string;
  canSubmit: boolean;
  browser: DetectedBrowser | null;
  detectionLabel: string | null;
  detectionIconSrc: string | null;
  helperMessage: string | null;
}

export type SeverityOrder = Record<Severity, number>;
