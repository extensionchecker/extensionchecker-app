import type { PhaseStatus } from '../../types';

export type RGB = [number, number, number];

export type PdfPhaseEntry = {
  title: string;
  status: PhaseStatus;
  /** When present, distinguishes lite regex scanning from a full AST code scan. */
  scanQuality?: 'lite' | 'full';
  detail: string;
};

export type SeverityStyle = {
  fill: RGB;
  border: RGB;
  text: RGB;
  pillFill: RGB;
};
