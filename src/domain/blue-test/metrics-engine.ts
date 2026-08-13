import {
  BlueQuestionAttempt,
  ChallengeCellStatus,
  ChallengeMatrixData,
  ChallengeMatrixItem,
  PercentIMetrics,
  SevenColor,
} from '../../types/blue-test';
import { isColdColor, isHotColor } from './color-engine';
import { calculateMaxConsciousTimeRaw } from './timing-engine';

/**
 * Calculates %i and related completion statistics from finalized or corrected question attempts.
 * Rules:
 * - Pending questions are NOT classified as hot or cold, and do NOT affect the denominator.
 * - If finalizedCount === 0, provisionalPercentI is null (displayed as "—").
 * - If finalizedCount < 49, isProvisional is true.
 * - %i = (coldColorCount / finalizedCount) * 100
 */
export function calculatePercentIMetrics(attempts: BlueQuestionAttempt[]): PercentIMetrics {
  const totalQuestions = 49;

  // Filter only finalized/corrected attempts
  const finalizedAttempts = attempts.filter((a) => a.finalizedAt);
  const finalizedCount = finalizedAttempts.length;

  const colorCounts: Record<SevenColor, number> = {
    red: 0,
    orange: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    indigo: 0,
    purple: 0,
  };

  let hotColorCount = 0;
  let coldColorCount = 0;

  for (const attempt of finalizedAttempts) {
    const color = attempt.effectiveColor;
    if (colorCounts[color] !== undefined) {
      colorCounts[color]++;
    }
    if (isHotColor(color)) {
      hotColorCount++;
    } else if (isColdColor(color)) {
      coldColorCount++;
    }
  }

  const completionPercent = (finalizedCount / totalQuestions) * 100;

  let provisionalPercentI: number | null = null;
  if (finalizedCount > 0) {
    provisionalPercentI = (coldColorCount / finalizedCount) * 100;
  }

  return {
    totalQuestions,
    finalizedCount,
    completionPercent,
    hotColorCount,
    coldColorCount,
    colorCounts,
    provisionalPercentI,
    isProvisional: finalizedCount < totalQuestions,
  };
}

/**
 * Calculates %i specifically for a given session (sessionNumber 1..7).
 */
export function calculateSessionPercentI(
  attempts: BlueQuestionAttempt[],
  sessionNumber: number
): { sessionNumber: number; finalizedCount: number; coldCount: number; percentI: number | null } {
  const sessionAttempts = attempts.filter((a) => a.sessionNumber === sessionNumber && a.finalizedAt);
  const finalizedCount = sessionAttempts.length;

  if (finalizedCount === 0) {
    return { sessionNumber, finalizedCount: 0, coldCount: 0, percentI: null };
  }

  const coldCount = sessionAttempts.filter((a) => isColdColor(a.effectiveColor)).length;
  const percentI = (coldCount / finalizedCount) * 100;

  return { sessionNumber, finalizedCount, coldCount, percentI };
}

/**
 * Calculates the Cumulative Challenge Matrix and derived metrics (%CPD, MCCN, ACCN, ACT).
 */
export function calculateChallengeMatrix(attempts: BlueQuestionAttempt[]): ChallengeMatrixData {
  // 1. Initialize matrix for Q_1..Q_49 and C_1..C_49
  const matrix: Record<number, Record<number, ChallengeCellStatus>> = {};
  for (let k = 1; k <= 49; k++) {
    matrix[k] = {};
    for (let j = 1; j <= 49; j++) {
      matrix[k][j] = 'not_attempted';
    }
  }

  // Map finalized attempts by globalQuestionOrder for easy lookup
  const finalizedAttemptsByOrder = new Map<number, BlueQuestionAttempt>();
  for (const attempt of attempts) {
    if (attempt.finalizedAt) {
      finalizedAttemptsByOrder.set(attempt.globalQuestionOrder, attempt);
    }
  }

  // 2. Populate matrix for each question Q_k
  for (let k = 1; k <= 49; k++) {
    const attempt = finalizedAttemptsByOrder.get(k);
    if (!attempt) {
      continue;
    }

    const m = attempt.stoppedAtChallengeIndex ?? k;
    for (let j = 1; j <= k; j++) {
      if (j < m) {
        matrix[k][j] = 'passed';
      } else if (j === m) {
        matrix[k][j] = 'failed';
      } else {
        matrix[k][j] = 'not_attempted';
      }
    }
  }

  // 3. Calculate per-challenge summary C_j (1..49)
  // a(C_j) is the count of failed attempts on challenge C_j prior to its first successful clearance.
  // Rendered in UI as a negative coefficient -n (e.g. -3 for 3 failed repetitions before success, -0 if cleared on 1st try).
  const challengeSummaries: ChallengeMatrixItem[] = [];
  let totalClearedCount = 0;
  let totalMCCN = 0;

  for (let j = 1; j <= 49; j++) {
    let isCleared = false;
    let failedCount = 0;
    let failedCountBeforeClear = 0;

    for (let k = 1; k <= 49; k++) {
      const status = matrix[k][j];
      if (!isCleared) {
        if (status === 'passed') {
          isCleared = true;
          failedCountBeforeClear = failedCount;
        } else if (status === 'failed') {
          failedCount++;
        }
      }
    }

    if (!isCleared) {
      failedCountBeforeClear = failedCount;
    } else {
      totalClearedCount++;
    }

    totalMCCN += failedCountBeforeClear;

    challengeSummaries.push({
      challengeIndex: j,
      isCleared,
      failedCountBeforeClear,
      passAttemptNumber: isCleared ? failedCountBeforeClear + 1 : undefined,
    });
  }

  // 4. Compute aggregate metrics
  const percentCPD = (totalClearedCount / 49) * 100;
  const accn = totalMCCN / 49;

  let totalMCT = 0;
  for (let k = 1; k <= 49; k++) {
    const sessionNumber = Math.ceil(k / 7);
    const questionInSession = ((k - 1) % 7) + 1;
    const attempt = finalizedAttemptsByOrder.get(k);
    const mct = attempt?.maxTimeSecondsRaw ?? calculateMaxConsciousTimeRaw(sessionNumber, questionInSession);
    totalMCT += mct;
  }
  const actSeconds = totalMCT / 49;

  return {
    matrix,
    challengeSummaries,
    totalClearedCount,
    percentCPD,
    totalMCCN,
    accn,
    actSeconds,
  };
}

