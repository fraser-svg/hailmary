/** Valid confidence values. */
export const CONFIDENCE_VALUES = ['low', 'medium', 'high'] as const;

export type Confidence = (typeof CONFIDENCE_VALUES)[number];

export function isValidConfidence(value: unknown): value is Confidence {
  return typeof value === 'string' && CONFIDENCE_VALUES.includes(value as Confidence);
}
