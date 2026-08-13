import { GreenRedRun } from '../types/green-red';

export const MOCK_GREEN_RUNS: GreenRedRun[] = [
  {
    id: 'green-run-1',
    testType: 'green',
    learnerId: 'learner-1',
    status: 'completed',
    completedAt: '2026-08-01T10:00:00Z',
    averageCPD: 1.85,
    totalScore: 24,
    questionResults: [
      { questionId: 'gq-1', score: 3, color: 'green', cvr: 0.9, cci: 0.8, cpd: 2.16 },
      { questionId: 'gq-2', score: 2, color: 'yellow', cvr: 0.8, cci: 0.7, cpd: 1.12 },
    ],
  },
];

export const MOCK_RED_RUNS: GreenRedRun[] = [
  {
    id: 'red-run-1',
    testType: 'red',
    learnerId: 'learner-2',
    status: 'completed',
    completedAt: '2026-08-02T11:30:00Z',
    averageCPD: 2.1,
    totalScore: 28,
    questionResults: [
      { questionId: 'rq-1', score: 3, color: 'green', cvr: 0.95, cci: 0.85, cpd: 2.42 },
      { questionId: 'rq-2', score: 1, color: 'orange', cvr: 0.6, cci: 0.5, cpd: 0.3 },
    ],
  },
];
