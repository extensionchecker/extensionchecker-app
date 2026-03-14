export type RGB = [number, number, number];

export type PhaseEntry = {
  title: string;
  status: 'Complete' | 'Not Available';
  detail: string;
};

export type SeverityStyle = {
  fill: RGB;
  border: RGB;
  text: RGB;
  pillFill: RGB;
};
