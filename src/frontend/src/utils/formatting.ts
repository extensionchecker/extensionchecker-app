import type { Severity } from '@extensionchecker/shared';
import type { Tone, ThemePreference, PhaseStatus } from '../types';

export function toneForSeverity(severity: Severity): Tone {
  if (severity === 'critical') {
    return 'danger';
  }

  if (severity === 'high') {
    return 'warning';
  }

  if (severity === 'medium') {
    return 'caution';
  }

  return 'good';
}

/** Human-readable access tier matching the 4-band scoring system. */
export function scoreBand(score: number): string {
  if (score <= 25) {
    return 'Minimal';
  }

  if (score <= 50) {
    return 'Moderate';
  }

  if (score <= 75) {
    return 'Broad';
  }

  return 'Complete';
}

/** RAGB colour for a capability score: green → yellow → orange → red (low = safe). */
export function scoreColor(score: number): string {
  if (score <= 25) {
    return '#22c55e'; // green
  }

  if (score <= 50) {
    return '#eab308'; // yellow
  }

  if (score <= 75) {
    return '#f97316'; // orange
  }

  return '#ef4444'; // red
}

/**
 * Human-readable trust tier across 5 levels.
 * Displayed on the Store Trust donut where high = trustworthy.
 */
export function trustScoreBand(score: number): string {
  if (score <= 20) {
    return 'Low';
  }

  if (score <= 40) {
    return 'Low / Med';
  }

  if (score <= 60) {
    return 'Medium';
  }

  if (score <= 80) {
    return 'Med / High';
  }

  return 'High';
}

/**
 * Inverted colour scale for store trust: red → orange → yellow → green
 * (low trust = red, high trust = green).
 */
export function trustScoreColor(score: number): string {
  if (score <= 20) {
    return '#ef4444'; // red - low trust
  }

  if (score <= 40) {
    return '#f97316'; // orange
  }

  if (score <= 60) {
    return '#eab308'; // yellow
  }

  if (score <= 80) {
    return '#84cc16'; // lime green
  }

  return '#22c55e'; // green - high trust
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function iconForTone(tone: Tone): string {
  if (tone === 'danger') {
    return 'dangerous';
  }

  if (tone === 'warning') {
    return 'warning';
  }

  if (tone === 'caution') {
    return 'info';
  }

  if (tone === 'good') {
    return 'check_circle';
  }

  return 'info';
}

export function iconForTheme(theme: ThemePreference): string {
  if (theme === 'light') {
    return 'light_mode';
  }

  if (theme === 'dark') {
    return 'dark_mode';
  }

  return 'computer';
}

export function phaseTone(status: PhaseStatus): Tone {
  if (status === 'complete') return 'good';
  if (status === 'cached') return 'info';
  return 'caution';
}

export function phaseIcon(status: PhaseStatus): string {
  if (status === 'complete') return 'check_circle';
  if (status === 'cached') return 'history';
  if (status === 'unavailable') return 'warning';
  return 'pending';
}

export function phaseStatusLabel(status: PhaseStatus): string {
  if (status === 'complete') return 'Complete';
  if (status === 'cached') return 'Cached';
  if (status === 'unavailable') return 'Unavailable';
  return 'Not Available';
}
