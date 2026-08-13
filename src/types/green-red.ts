export type FourColorScore = 'green' | 'yellow' | 'orange' | 'red';

export interface GreenRedQuestionResult {
  questionId: string;
  score: number; // 0..3
  color: FourColorScore;
  cvr: number;
  cci: number;
  cpd: number; // CPD = CVR * CCI * score
  probeDepth?: number;
}

export interface GreenRedRun {
  id: string;
  testType: 'green' | 'red';
  learnerId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completedAt?: string;
  averageCPD: number;
  totalScore: number;
  questionResults: GreenRedQuestionResult[];
}
