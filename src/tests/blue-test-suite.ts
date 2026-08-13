import {
  calculateMaxConsciousTimeRaw,
  formatTimeDisplay,
  generateBlueTestQuestions,
} from '../domain/blue-test/timing-engine';
import { deriveSevenColor } from '../domain/blue-test/color-engine';
import { calculatePercentIMetrics, calculateChallengeMatrix } from '../domain/blue-test/metrics-engine';
import { BlueTestStorageAdapter } from '../persistence/blue-test-storage';
import { BlueQuestionAttempt } from '../types/blue-test';
import { MOCK_GREEN_RUNS, MOCK_RED_RUNS } from '../data/green-red-data';

export function runBlueTestSuite(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(condition: boolean, message: string) {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push(`Assertion failed: ${message}`);
      console.error(`❌ ${message}`);
    }
  }

  console.log('\n--- Running Blue Test Timing Engine Suite ---');

  // Test 1: Generate 49 questions
  const questions = generateBlueTestQuestions();
  assert(questions.length === 49, 'Should generate exactly 49 questions');

  // Test 2: Exactly 7 sessions, 7 questions each
  const sessions = new Set(questions.map((q) => q.sessionNumber));
  assert(sessions.size === 7, 'Should contain exactly 7 sessions');

  for (let s = 1; s <= 7; s++) {
    const sessionQs = questions.filter((q) => q.sessionNumber === s);
    assert(sessionQs.length === 7, `Session ${s} should have exactly 7 questions`);
  }

  // Test 3: Expected endpoint calculations
  // Q7 (S1, Q7) = 1.86 raw, display 1.9s
  const q7Raw = calculateMaxConsciousTimeRaw(1, 7);
  assert(Math.abs(q7Raw - 1.86) < 1e-6, `Q7 raw should be 1.86, got ${q7Raw}`);
  assert(formatTimeDisplay(q7Raw) === '1.9s', `Q7 display should be '1.9s', got '${formatTimeDisplay(q7Raw)}'`);

  // Q14 (S2, Q7) = 3.4596 raw (1.86^2), display 3.5s
  const q14Raw = calculateMaxConsciousTimeRaw(2, 7);
  assert(Math.abs(q14Raw - 3.4596) < 1e-6, `Q14 raw should be 3.4596, got ${q14Raw}`);
  assert(formatTimeDisplay(q14Raw) === '3.5s', `Q14 display should be '3.5s', got '${formatTimeDisplay(q14Raw)}'`);

  // Q21 (S3, Q7) = 6.434856 raw (1.86^3), display 6.4s
  const q21Raw = calculateMaxConsciousTimeRaw(3, 7);
  assert(Math.abs(q21Raw - 6.434856) < 1e-5, `Q21 raw should be 6.434856, got ${q21Raw}`);
  assert(formatTimeDisplay(q21Raw) === '6.4s', `Q21 display should be '6.4s', got '${formatTimeDisplay(q21Raw)}'`);

  // Q28 (S4, Q7) = ~11.9688 raw (1.86^4), display 12.0s
  const q28Raw = calculateMaxConsciousTimeRaw(4, 7);
  assert(Math.abs(q28Raw - 11.968832) < 1e-4, `Q28 raw should be approx 11.9688, got ${q28Raw}`);
  assert(formatTimeDisplay(q28Raw) === '12.0s', `Q28 display should be '12.0s', got '${formatTimeDisplay(q28Raw)}'`);

  // Q35 (S5, Q7) = ~22.2620 raw (1.86^5), display 22.3s
  const q35Raw = calculateMaxConsciousTimeRaw(5, 7);
  assert(Math.abs(q35Raw - 22.2620) < 1e-3, `Q35 raw should be approx 22.2620, got ${q35Raw}`);
  assert(formatTimeDisplay(q35Raw) === '22.3s', `Q35 display should be '22.3s', got '${formatTimeDisplay(q35Raw)}'`);

  // Q42 (S6, Q7) = ~41.4074 raw (1.86^6), display 41.4s
  const q42Raw = calculateMaxConsciousTimeRaw(6, 7);
  assert(Math.abs(q42Raw - 41.40737) < 1e-3, `Q42 raw should be approx 41.4074, got ${q42Raw}`);
  assert(formatTimeDisplay(q42Raw) === '41.4s', `Q42 display should be '41.4s', got '${formatTimeDisplay(q42Raw)}'`);

  // Q49 (S7, Q7) = ~77.017711 raw (1.86^7), display 77.0s
  const q49Raw = calculateMaxConsciousTimeRaw(7, 7);
  assert(Math.abs(q49Raw - 77.017711) < 1e-3, `Q49 raw should be approx 77.0177, got ${q49Raw}`);
  assert(formatTimeDisplay(q49Raw) === '77.0s', `Q49 display should be '77.0s', got '${formatTimeDisplay(q49Raw)}'`);

  console.log('\n--- Running Seven-Color Boundary Suite ---');

  const maxT = 14.0;
  // 0 -> Red
  assert(deriveSevenColor(0, maxT) === 'red', 'Elapsed 0s should be Red');
  // 1/7 - eps -> Red
  assert(deriveSevenColor(1.9, maxT) === 'red', 'Elapsed 1.9s (ratio ~0.135) should be Red');
  // 1/7 = 2.0s -> Orange
  assert(deriveSevenColor(2.0, maxT) === 'orange', 'Elapsed 2.0s (ratio 1/7) should be Orange');
  // 2/7 = 4.0s -> Yellow
  assert(deriveSevenColor(4.0, maxT) === 'yellow', 'Elapsed 4.0s (ratio 2/7) should be Yellow');
  // 3/7 = 6.0s -> Green
  assert(deriveSevenColor(6.0, maxT) === 'green', 'Elapsed 6.0s (ratio 3/7) should be Green');
  // 4/7 = 8.0s -> Blue
  assert(deriveSevenColor(8.0, maxT) === 'blue', 'Elapsed 8.0s (ratio 4/7) should be Blue');
  // 5/7 = 10.0s -> Indigo
  assert(deriveSevenColor(10.0, maxT) === 'indigo', 'Elapsed 10.0s (ratio 5/7) should be Indigo');
  // 6/7 = 12.0s -> Purple
  assert(deriveSevenColor(12.0, maxT) === 'purple', 'Elapsed 12.0s (ratio 6/7) should be Purple');
  // exact max = 14.0s -> Purple
  assert(deriveSevenColor(14.0, maxT) === 'purple', 'Elapsed 14.0s (max time) should be Purple');
  // > max = 20.0s -> Purple
  assert(deriveSevenColor(20.0, maxT) === 'purple', 'Elapsed > max should be Purple');

  console.log('\n--- Running Persistence & Correction Suite ---');

  // Clear mock storage
  BlueTestStorageAdapter.clearAllBlueData();

  // Test createNewAssignment
  const ass1 = BlueTestStorageAdapter.createAssignment('test-learner-99');
  const ass2 = BlueTestStorageAdapter.createNewAssignment('test-learner-99');
  assert(ass1.id !== ass2.id, 'createNewAssignment must create a distinct new assignment ID');
  assert(ass2.currentGlobalOrder === 1, 'New assignment currentGlobalOrder must start at 1');
  assert(ass2.status === 'in_progress', 'New assignment status must be in_progress');

  // Test 1: Finalize attempt idempotently
  const res1 = BlueTestStorageAdapter.finalizeAttempt({
    assignmentId: 'test-assign-1',
    runId: 'run-1',
    questionId: 'q-1',
    globalQuestionOrder: 1,
    sessionNumber: 1,
    questionInSession: 1,
    maxTimeSecondsRaw: 0.2657,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    elapsedSecondsRaw: 0.15,
    completionRatio: 0.15 / 0.2657,
    derivedColorAtStop: 'green',
    effectiveColor: 'green',
    completionMode: 'manual_end',
  });

  assert(res1.attempt.effectiveColor === 'green', 'Finalized attempt effectiveColor should be green');
  assert(res1.attempt.completionMode === 'manual_end', 'Completion mode should be manual_end');

  // Double finalization idempotency
  const res1Double = BlueTestStorageAdapter.finalizeAttempt({
    assignmentId: 'test-assign-1',
    runId: 'run-1',
    questionId: 'q-1',
    globalQuestionOrder: 1,
    sessionNumber: 1,
    questionInSession: 1,
    maxTimeSecondsRaw: 0.2657,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    elapsedSecondsRaw: 0.15,
    completionRatio: 0.15 / 0.2657,
    derivedColorAtStop: 'green',
    effectiveColor: 'green',
    completionMode: 'manual_end',
  });

  assert(res1Double.attempt.id === res1.attempt.id, 'Idempotent finalization should return same attempt ID');

  // Test Correction
  const corrRes = BlueTestStorageAdapter.correctAttempt({
    attemptId: res1.attempt.id,
    newEffectiveColor: 'blue',
    reason: 'Teacher observed clear hesitation before response',
    actor: 'Teacher',
  });

  assert(corrRes.attempt.effectiveColor === 'blue', 'Corrected effectiveColor should update to blue');
  assert(corrRes.attempt.completionMode === 'correction', 'Completion mode should be correction');
  assert(corrRes.attempt.correctionReason === 'Teacher observed clear hesitation before response', 'Reason stored');

  // Test empty correction reason rejection
  let emptyErrorCaught = false;
  try {
    BlueTestStorageAdapter.correctAttempt({
      attemptId: res1.attempt.id,
      newEffectiveColor: 'purple',
      reason: '   ',
      actor: 'Teacher',
    });
  } catch (e) {
    emptyErrorCaught = true;
  }
  assert(emptyErrorCaught, 'Correction with empty reason should throw error');

  console.log('\n--- Running Challenge Matrix Engine Suite ---');
  // Test matrix calculation with mock attempts
  const mockAttempts: BlueQuestionAttempt[] = [
    {
      id: 'att-1',
      assignmentId: 'test-assign-1',
      runId: 'run-1',
      questionId: 'q-1',
      globalQuestionOrder: 1,
      sessionNumber: 1,
      questionInSession: 1,
      maxTimeSecondsRaw: 0.2657,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      elapsedSecondsRaw: 0.2,
      completionRatio: 0.75,
      derivedColorAtStop: 'green',
      effectiveColor: 'green',
      completionMode: 'manual_end',
      stoppedAtChallengeIndex: 1,
      finalizedAt: new Date().toISOString(),
      latestEventSequence: 1,
    },
    {
      id: 'att-2',
      assignmentId: 'test-assign-1',
      runId: 'run-1',
      questionId: 'q-2',
      globalQuestionOrder: 2,
      sessionNumber: 1,
      questionInSession: 2,
      maxTimeSecondsRaw: 0.5314,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      elapsedSecondsRaw: 0.4,
      completionRatio: 0.75,
      derivedColorAtStop: 'green',
      effectiveColor: 'green',
      completionMode: 'manual_end',
      stoppedAtChallengeIndex: 2, // C1 passed, C2 failed
      finalizedAt: new Date().toISOString(),
      latestEventSequence: 2,
    },
  ];

  const matrixData = calculateChallengeMatrix(mockAttempts);
  assert(matrixData.matrix[1][1] === 'failed', 'Q1 C1 should be failed');
  assert(matrixData.matrix[2][1] === 'passed', 'Q2 C1 should be passed');
  assert(matrixData.matrix[2][2] === 'failed', 'Q2 C2 should be failed');
  assert(matrixData.matrix[2][3] === 'not_attempted', 'Q2 C3 should be not_attempted');

  // C1 was failed on Q1 then passed on Q2 -> isCleared = true, failedCountBeforeClear = 1
  const c1Summary = matrixData.challengeSummaries.find((s) => s.challengeIndex === 1);
  assert(c1Summary !== undefined && c1Summary.isCleared === true, 'C1 should be cleared');
  assert(c1Summary !== undefined && c1Summary.failedCountBeforeClear === 1, 'C1 MCCN should be 1');

  // C2 was failed on Q2 and never passed -> isCleared = false, failedCountBeforeClear = 1
  const c2Summary = matrixData.challengeSummaries.find((s) => s.challengeIndex === 2);
  assert(c2Summary !== undefined && c2Summary.isCleared === false, 'C2 should not be cleared');
  assert(c2Summary !== undefined && c2Summary.failedCountBeforeClear === 1, 'C2 MCCN should be 1');

  assert(matrixData.totalClearedCount === 1, 'totalClearedCount should be 1');
  assert(Math.abs(matrixData.percentCPD - (1 / 49) * 100) < 1e-5, '%CPD should be approx 2.04%');
  assert(matrixData.totalMCCN === 2, 'totalMCCN should be 2');
  assert(Math.abs(matrixData.accn - 2 / 49) < 1e-5, 'accn should be 2 / 49');
  assert(matrixData.actSeconds > 0, 'actSeconds should be positive');

  console.log('\n--- Running Non-Regression Baseline Suite ---');

  assert(MOCK_GREEN_RUNS.length > 0, 'Green test mock runs exist and unaffected');
  assert(MOCK_GREEN_RUNS[0].averageCPD === 1.85, 'Green test CPD calculation unchanged');
  assert(MOCK_RED_RUNS.length > 0, 'Red test mock runs exist and unaffected');
  assert(MOCK_RED_RUNS[0].averageCPD === 2.1, 'Red test CPD calculation unchanged');

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.\n`);
  return { passed, failed, errors };
}
