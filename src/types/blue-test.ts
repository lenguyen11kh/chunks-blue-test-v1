export type SevenColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple';

export type CompletionMode = 'manual_end' | 'auto_max' | 'manual_red' | 'correction';

export type QuestionState = 'awaiting_start' | 'running' | 'finalizing' | 'result_review' | 'correction_open' | 'error';

export interface SevenColorDefinition {
  color: SevenColor;
  labelEn: string;
  labelVi: string;
  hex: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  isHot: boolean; // Red, Orange, Yellow are hot
}

export interface BlueQuestionDefinition {
  id: string;
  sessionNumber: number; // 1..7
  questionInSession: number; // 1..7
  globalOrder: number; // 1..49
  maxTimeSecondsRaw: number;
  maxTimeDisplay: string; // e.g. "1.9s"
  promptText: string;
}

export interface BlueSessionIntro {
  sessionNumber: number;
  title: string;
  narrationText: string;
}

export interface BlueTestPackage {
  id: string;
  name: string;
  version: string;
  packageIntroText: string;
  packageEndText: string;
  sessionIntros: BlueSessionIntro[];
  questions: BlueQuestionDefinition[];
}

export interface BlueAssignment {
  id: string;
  learnerId: string;
  packageVersionId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  assignedAt: string;
  assignedBy: string;
  completedAt?: string;
  currentGlobalOrder: number; // 1..49
  currentSessionNumber: number; // 1..7
}

export interface BlueSessionRun {
  id: string;
  assignmentId: string;
  sessionNumber: number;
  status: 'not_started' | 'in_progress' | 'completed';
  startedAt?: string;
  completedAt?: string;
}

export interface BlueQuestionAttempt {
  id: string;
  assignmentId: string;
  runId: string;
  questionId: string;
  globalQuestionOrder: number; // 1..49
  sessionNumber: number;
  questionInSession: number;
  maxTimeSecondsRaw: number;
  startedAt: string;
  endedAt: string;
  targetDeadlineTimestamp?: number;
  elapsedSecondsRaw: number;
  completionRatio: number; // clamp(elapsedSeconds / maxTimeSeconds, 0, 1)
  derivedColorAtStop: SevenColor;
  effectiveColor: SevenColor;
  effectiveElapsedSeconds?: number;
  effectiveCompletionRatio?: number;
  completionMode: CompletionMode;
  stoppedAtChallengeIndex?: number; // 1..globalQuestionOrder (the challenge index C_m where learner stopped/failed)
  finalizedAt: string;
  correctedAt?: string;
  latestEventSequence: number;
  correctionReason?: string;
  correctedBy?: string;
}

export type AuditEventType =
  | 'attempt_started'
  | 'attempt_ended'
  | 'auto_max_reached'
  | 'manual_red_recorded'
  | 'result_finalized'
  | 'result_corrected'
  | 'attempt_reset';

export interface BlueAuditEvent {
  id: string;
  attemptId: string;
  assignmentId: string;
  eventType: AuditEventType;
  sequence: number;
  timestamp: string;
  actor: string;
  details: {
    elapsedSecondsRaw?: number;
    derivedColor?: SevenColor;
    effectiveColor?: SevenColor;
    previousColor?: SevenColor;
    reason?: string;
    mode?: CompletionMode;
    effectiveElapsedSeconds?: number;
    effectiveCompletionRatio?: number;
    observedElapsedSecondsRaw?: number;
    observedCompletionRatio?: number;
  };
}

export interface PercentIMetrics {
  totalQuestions: number; // 49
  finalizedCount: number;
  completionPercent: number;
  hotColorCount: number;
  coldColorCount: number;
  colorCounts: Record<SevenColor, number>;
  provisionalPercentI: number | null; // null if finalizedCount === 0
  isProvisional: boolean; // true if finalizedCount < 49
}

export interface AudioSettings {
  autoplayPackageIntro: boolean; // Mapped to Autoplay Test Intro
  autoplayTestIntro?: boolean;    // Alias for Autoplay Test Intro
  autoplaySessionIntro: boolean;
  autoplayQuestionNumber?: boolean;
  autoplayQuestionCue?: boolean;
  autoplayPackageEnd: boolean;
  enableBells: boolean;
}

export type NarrationLocationKey = string;

export interface BlueAudioVersion {
  id: string;
  locationKey: NarrationLocationKey;
  version: number;
  scriptText: string;
  voice: string; // 'Kore'
  model: string; // 'gemini-3.1-flash-tts-preview'
  audioUrl: string; // e.g. "/api/tts/audio/xxx" or data URL
  durationSeconds?: number;
  fileSizeBytes?: number;
  createdAt: string;
  isActive: boolean;
}

export interface BlueAudioLocationInfo {
  locationKey: NarrationLocationKey;
  label: string;
  description: string;
  defaultScript: string;
  activeVersionId: string | null;
  versions: BlueAudioVersion[];
}

export type ChallengeCellStatus = 'passed' | 'failed' | 'not_attempted';

export interface ChallengeMatrixItem {
  challengeIndex: number; // 1..49
  isCleared: boolean;     // Has at least 1 PASSED in any question
  failedCountBeforeClear: number; // 'a' or MCCN: number of failed attempts on C_j before its first success
  passAttemptNumber?: number; // 1-based attempt number on which C_j was passed (failedCountBeforeClear + 1 if cleared)
}

export interface ChallengeMatrixData {
  // matrix[globalQuestionOrder][challengeIndex] = status
  matrix: Record<number, Record<number, ChallengeCellStatus>>;
  challengeSummaries: ChallengeMatrixItem[]; // 49 items
  totalClearedCount: number;  // Number of challenges cleared (0..49)
  percentCPD: number;         // (totalClearedCount / 49) * 100
  totalMCCN: number;          // Sum of failedCountBeforeClear across all 49 challenges
  accn: number;               // totalMCCN / 49
  actSeconds: number;         // Total MCT / 49
}


