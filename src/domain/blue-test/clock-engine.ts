export type ClockPhase = 'none' | 'slow' | 'medium' | 'urgent';

export function getClockPhase(
  maxTimeSeconds: number,
  elapsedSeconds: number
): ClockPhase {
  if (maxTimeSeconds <= 0) {
    return 'none';
  }

  if (elapsedSeconds >= maxTimeSeconds) {
    return 'none';
  }

  // Keep 1 consistent medium clock sound throughout (no rushing or phase changes near the end)
  return 'medium';
}


