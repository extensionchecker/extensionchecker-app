import type { SmartSubmissionState } from '../types';
import {
  detectedBrowserFromUrl,
  detectedBrowserFromId,
  browserDetectionLabel,
  browserDetectionIconSrc,
  unsupportedBrowserMessage
} from './browser-detection';

export function detectSmartSubmission(value: string): SmartSubmissionState {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      kind: 'empty',
      normalizedValue: '',
      canSubmit: false,
      browser: null,
      detectionLabel: null,
      detectionIconSrc: null,
      helperMessage: null
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const normalizedValue = parsed.toString();
      const isHttps = parsed.protocol === 'https:';
      const browser = detectedBrowserFromUrl(parsed);
      const unsupportedMessage = unsupportedBrowserMessage(browser, 'url');

      return {
        kind: 'url',
        normalizedValue,
        canSubmit: isHttps && unsupportedMessage === null,
        browser,
        detectionLabel: browserDetectionLabel(browser, 'url'),
        detectionIconSrc: browserDetectionIconSrc(browser),
        helperMessage: !isHttps ? 'Use an https URL.' : unsupportedMessage
      };
    } catch {
      return {
        kind: 'invalid-url',
        normalizedValue: trimmed,
        canSubmit: false,
        browser: null,
        detectionLabel: null,
        detectionIconSrc: null,
        helperMessage: 'Enter a full URL or extension ID.'
      };
    }
  }

  const browser = detectedBrowserFromId(trimmed);
  const unsupportedMessage = unsupportedBrowserMessage(browser, 'id');

  return {
    kind: 'id',
    normalizedValue: trimmed,
    canSubmit: unsupportedMessage === null,
    browser,
    detectionLabel: browserDetectionLabel(browser, 'id'),
    detectionIconSrc: browserDetectionIconSrc(browser),
    helperMessage: unsupportedMessage
  };
}
