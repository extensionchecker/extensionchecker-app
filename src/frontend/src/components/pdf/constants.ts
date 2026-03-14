import type { Severity } from '@extensionchecker/shared';
import type { RGB, SeverityStyle } from './types';

export const PAGE_BG: RGB = [244, 247, 255];
export const HEADER_BG: RGB = [16, 35, 76];
export const HEADER_TEXT: RGB = [240, 246, 255];
export const BODY_TEXT: RGB = [25, 33, 49];
export const MUTED_TEXT: RGB = [93, 104, 128];
export const CARD_BG: RGB = [255, 255, 255];
export const CARD_BORDER: RGB = [214, 224, 243];

export const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  low: {
    fill: [234, 249, 238],
    border: [92, 192, 112],
    text: [28, 113, 53],
    pillFill: [214, 243, 222]
  },
  medium: {
    fill: [255, 245, 226],
    border: [235, 172, 71],
    text: [132, 85, 21],
    pillFill: [255, 234, 194]
  },
  high: {
    fill: [255, 232, 232],
    border: [230, 94, 94],
    text: [141, 36, 36],
    pillFill: [255, 214, 214]
  },
  critical: {
    fill: [255, 221, 225],
    border: [214, 62, 88],
    text: [118, 18, 38],
    pillFill: [255, 199, 209]
  }
};
