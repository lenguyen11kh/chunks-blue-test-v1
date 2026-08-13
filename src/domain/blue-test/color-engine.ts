import { SevenColor, SevenColorDefinition } from '../../types/blue-test';

export const SEVEN_COLORS_ORDERED: SevenColorDefinition[] = [
  {
    color: 'red',
    labelEn: 'Red',
    labelVi: 'Đỏ',
    hex: '#EF4444',
    bgClass: 'bg-red-500',
    textClass: 'text-red-500',
    borderClass: 'border-red-500',
    isHot: true,
  },
  {
    color: 'orange',
    labelEn: 'Orange',
    labelVi: 'Cam',
    hex: '#F97316',
    bgClass: 'bg-orange-500',
    textClass: 'text-orange-500',
    borderClass: 'border-orange-500',
    isHot: true,
  },
  {
    color: 'yellow',
    labelEn: 'Yellow',
    labelVi: 'Vàng',
    hex: '#EAB308',
    bgClass: 'bg-yellow-500',
    textClass: 'text-yellow-500',
    borderClass: 'border-yellow-500',
    isHot: true,
  },
  {
    color: 'green',
    labelEn: 'Green',
    labelVi: 'Lục',
    hex: '#22C55E',
    bgClass: 'bg-green-500',
    textClass: 'text-green-500',
    borderClass: 'border-green-500',
    isHot: false,
  },
  {
    color: 'blue',
    labelEn: 'Blue',
    labelVi: 'Lam',
    hex: '#3B82F6',
    bgClass: 'bg-blue-500',
    textClass: 'text-blue-500',
    borderClass: 'border-blue-500',
    isHot: false,
  },
  {
    color: 'indigo',
    labelEn: 'Indigo',
    labelVi: 'Chàm',
    hex: '#4F46E5',
    bgClass: 'bg-indigo-600',
    textClass: 'text-indigo-600',
    borderClass: 'border-indigo-600',
    isHot: false,
  },
  {
    color: 'purple',
    labelEn: 'Purple',
    labelVi: 'Tím',
    hex: '#A855F7',
    bgClass: 'bg-purple-500',
    textClass: 'text-purple-500',
    borderClass: 'border-purple-500',
    isHot: false,
  },
];

export function getSevenColorDefinition(color: SevenColor): SevenColorDefinition {
  const def = SEVEN_COLORS_ORDERED.find((c) => c.color === color);
  if (!def) {
    return SEVEN_COLORS_ORDERED[0]; // fallback
  }
  return def;
}

/**
 * Derives the seven-color result based on raw elapsed time and raw max time.
 * Formula:
 * completionRatio = clamp(elapsedSeconds / maxTimeSeconds, 0, 1)
 * colorIndex = min(6, floor(completionRatio * 7))
 *
 * Boundary rules:
 * - 0 <= ratio < 1/7 => Red (0)
 * - 1/7 <= ratio < 2/7 => Orange (1)
 * - 2/7 <= ratio < 3/7 => Yellow (2)
 * - 3/7 <= ratio < 4/7 => Green (3)
 * - 4/7 <= ratio < 5/7 => Blue (4)
 * - 5/7 <= ratio < 6/7 => Indigo (5)
 * - 6/7 <= ratio <= 1 => Purple (6)
 * - > maxTime => Clamped to Purple (6)
 */
export function deriveSevenColor(elapsedSeconds: number, maxTimeSecondsRaw: number): SevenColor {
  if (maxTimeSecondsRaw <= 0) return 'red';
  const ratio = Math.max(0, Math.min(1, elapsedSeconds / maxTimeSecondsRaw));

  // Handle upper boundary precision
  if (ratio >= 1.0) {
    return 'purple';
  }

  const index = Math.min(6, Math.floor(ratio * 7));
  return SEVEN_COLORS_ORDERED[index].color;
}

/**
 * Returns true if the color is a "hot" color (Red, Orange, Yellow).
 */
export function isHotColor(color: SevenColor): boolean {
  return color === 'red' || color === 'orange' || color === 'yellow';
}

/**
 * Returns true if the color is a "cold" color (Green, Blue, Indigo, Purple).
 */
export function isColdColor(color: SevenColor): boolean {
  return color === 'green' || color === 'blue' || color === 'indigo' || color === 'purple';
}

/**
 * Calculates effective values based on effective color vs derived color at stop.
 * - If uncorrected (effectiveColor matches derivedColorAtStop), effective values equal observed values.
 * - If corrected:
 *   - Red (index 0): Effective Completion = 0%, Effective Elapsed = 0.0s.
 *   - Other colors (index i = 1..6): Effective Completion = i/7, Effective Elapsed = (i/7) * maxTime.
 */
export function calculateEffectiveValues(
  effectiveColor: SevenColor,
  maxTimeSecondsRaw: number,
  observedElapsedSecondsRaw: number,
  observedCompletionRatio: number,
  derivedColorAtStop: SevenColor
): { effectiveElapsedSeconds: number; effectiveCompletionRatio: number } {
  if (effectiveColor === derivedColorAtStop) {
    return {
      effectiveElapsedSeconds: observedElapsedSecondsRaw,
      effectiveCompletionRatio: observedCompletionRatio,
    };
  }

  const colorIndex = SEVEN_COLORS_ORDERED.findIndex((c) => c.color === effectiveColor);
  const index = colorIndex >= 0 ? colorIndex : 0;

  const effectiveCompletionRatio = Math.max(0, Math.min(1, index / 7));
  const effectiveElapsedSeconds = effectiveCompletionRatio * maxTimeSecondsRaw;

  return {
    effectiveElapsedSeconds,
    effectiveCompletionRatio,
  };
}

export function getEffectiveAttemptValues(attempt: {
  effectiveColor: SevenColor;
  maxTimeSecondsRaw: number;
  elapsedSecondsRaw: number;
  completionRatio: number;
  derivedColorAtStop: SevenColor;
  effectiveElapsedSeconds?: number;
  effectiveCompletionRatio?: number;
}): { effectiveElapsedSeconds: number; effectiveCompletionRatio: number } {
  if (
    attempt.effectiveElapsedSeconds !== undefined &&
    attempt.effectiveCompletionRatio !== undefined
  ) {
    return {
      effectiveElapsedSeconds: attempt.effectiveElapsedSeconds,
      effectiveCompletionRatio: attempt.effectiveCompletionRatio,
    };
  }
  return calculateEffectiveValues(
    attempt.effectiveColor,
    attempt.maxTimeSecondsRaw,
    attempt.elapsedSecondsRaw,
    attempt.completionRatio,
    attempt.derivedColorAtStop
  );
}
