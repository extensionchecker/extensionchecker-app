import type { Severity } from '@extensionchecker/shared';
import type { Tone, ThemePreference, PhaseStatus } from '../types';

export function toneForSeverity(severity: Severity): Tone {
  if (severity === 'critical' || severity === 'high') {
    return 'danger';
  }

  if (severity === 'medium') {
    return 'caution';
  }

  return 'good';
}

export function scoreBand(score: number): string {
  if (score <= 20) {
    return 'Low';
  }

  if (score <= 40) {
    return 'Low / Medium';
  }

  if (score <= 60) {
    return 'Medium';
  }

  if (score <= 80) {
    return 'Medium / High';
  }

  return 'High';
}

export function scoreColor(score: number): string {
  if (score <= 25) {
    return '#22c55e';
  }

  if (score <= 50) {
    return '#f59e0b';
  }

  return '#ef4444';
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

  if (tone === 'caution') {
    return 'warning';
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
  return status === 'complete' ? 'good' : 'caution';
}

export function phaseIcon(status: PhaseStatus): string {
  return status === 'complete' ? 'check_circle' : 'pending';
}

export function phaseStatusLabel(status: PhaseStatus): string {
  return status === 'complete' ? 'Complete' : 'Not Available';
}
