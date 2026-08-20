import {
  BlueAssignment,
  BlueAuditEvent,
  BlueQuestionAttempt,
  BlueSessionRun,
  SevenColor,
  CompletionMode,
  AuditEventType,
  AudioSettings,
  BlueTestMode,
} from '../types/blue-test';
import { Learner } from '../types/common';

import { calculateEffectiveValues } from '../domain/blue-test/color-engine';

const STORAGE_KEYS = {
  ASSIGNMENTS: 'blue_test_assignments',
  RUNS: 'blue_test_runs',
  ATTEMPTS: 'blue_test_attempts',
  EVENTS: 'blue_test_audit_events',
  LEARNERS: 'blue_test_learners',
  AUDIO_SETTINGS: 'blue_test_audio_settings',
  PLAYED_INTROS: 'blue_test_played_intros',
};

export const DEFAULT_LEARNERS: Learner[] = [
  {
    id: 'learner-1',
    name: 'Lucy',
    code: 'L-6446',
    grade: 'Grade 3A',
    isActive: true,
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=L-6446',
  },
  {
    id: 'learner-2',
    name: 'Max',
    code: 'L-8821',
    grade: 'Grade 3B',
    isActive: true,
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=L-8821',
  },
  {
    id: 'learner-3',
    name: 'Alex',
    code: 'L-3104',
    grade: 'Grade 4A',
    isActive: true,
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=L-3104',
  },
];

const memoryStorage = new Map<string, string>();
let isInitialized = false;
let updateQueue: Record<string, any> = {};
let syncTimeout: NodeJS.Timeout | null = null;

const storageSubscribers = new Set<() => void>();

export function subscribeStorageChanges(listener: () => void): () => void {
  storageSubscribers.add(listener);
  return () => {
    storageSubscribers.delete(listener);
  };
}

export function notifyStorageSubscribers(): void {
  storageSubscribers.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('Storage subscriber error', e);
    }
  });
}

export function applyServerSyncData(data: Record<string, any>): void {
  let changed = false;
  for (const [key, value] of Object.entries(data)) {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    if (memoryStorage.get(key) !== raw) {
      memoryStorage.set(key, raw);
      changed = true;
    }
  }
  if (changed) {
    notifyStorageSubscribers();
  }
}

async function syncToServer() {
  if (Object.keys(updateQueue).length === 0) return;
  const payload = { ...updateQueue };
  try {
    const res = await fetch('/api/blue-test-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      for (const key of Object.keys(payload)) {
        if (updateQueue[key] === payload[key]) {
          delete updateQueue[key];
        }
      }
    }
  } catch (e) {
    console.warn('Sync to server failed, will retry', e);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    syncToServer();
  });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      syncToServer();
    }
  });
}

export async function initializeBlueTestStorage(): Promise<void> {
  if (isInitialized) return;
  try {
    const res = await fetch('/api/blue-test-data');
    if (res.ok) {
      const data = await res.json();
      for (const [key, value] of Object.entries(data)) {
        memoryStorage.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
      notifyStorageSubscribers();
    }
  } catch (e) {
    console.warn('Failed to load initial data', e);
  }
  isInitialized = true;
}

function getStorageItem<T>(key: string, defaultValue: T): T {
  try {
    let raw: string | null = memoryStorage.get(key) || null;
    if (raw) return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`Error reading memory key "${key}":`, e);
  }
  return defaultValue;
}

function setStorageItem<T>(key: string, value: T): void {
  try {
    const raw = JSON.stringify(value);
    memoryStorage.set(key, raw);
    
    // sync queue
    const parsed = JSON.parse(raw);
    updateQueue[key] = parsed;

    // Send update via WebSocket if available
    import('./websocket-sync')
      .then(({ wsSyncManager }) => {
        wsSyncManager.sendDataUpdate({ [key]: parsed });
      })
      .catch((e) => {
        console.warn('WS update dispatch error', e);
      });

    notifyStorageSubscribers();
    
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(syncToServer, 300);
  } catch (e) {
    console.warn(`Error writing memory key "${key}":`, e);
  }
}

export class BlueTestStorageAdapter {
  // Learners Roster Storage
  static getLearners(includeInactive = true): Learner[] {
    let list = getStorageItem<Learner[]>(STORAGE_KEYS.LEARNERS, []);
    if (!list || !Array.isArray(list) || list.length === 0) {
      list = DEFAULT_LEARNERS;
      setStorageItem(STORAGE_KEYS.LEARNERS, list);
    }

    list = list.map((l) => ({
      ...l,
      isActive: l.isActive ?? true,
    }));

    if (includeInactive) {
      return list;
    }

    const activeList = list.filter((l) => l.isActive !== false);
    if (activeList.length === 0 && list.length > 0) {
      list[0].isActive = true;
      setStorageItem(STORAGE_KEYS.LEARNERS, list);
      return [list[0]];
    }

    return activeList;
  }

  static getLearner(id: string): Learner | null {
    const learners = this.getLearners(true);
    return learners.find((l) => l.id === id) || null;
  }

  static saveLearner(learner: Learner): Learner {
    const learners = this.getLearners(true);
    const existingIndex = learners.findIndex((l) => l.id === learner.id);
    const updated: Learner = {
      ...learner,
      isActive: learner.isActive ?? true,
    };

    if (existingIndex >= 0) {
      learners[existingIndex] = updated;
    } else {
      learners.push(updated);
    }
    setStorageItem(STORAGE_KEYS.LEARNERS, learners);
    return updated;
  }

  static hasLearnerHistory(learnerId: string): boolean {
    const assignments = this.getAssignments();
    return assignments.some((a) => a.learnerId === learnerId);
  }

  static setLearnerActive(learnerId: string, isActive: boolean): Learner {
    const learner = this.getLearner(learnerId);
    if (!learner) {
      throw new Error(`Learner ${learnerId} not found`);
    }
    learner.isActive = isActive;
    return this.saveLearner(learner);
  }

  static deleteLearner(learnerId: string): void {
    const learners = this.getLearners(true);
    let updated = learners.filter((l) => l.id !== learnerId);
    if (updated.length === 0) {
      updated = DEFAULT_LEARNERS;
    }
    setStorageItem(STORAGE_KEYS.LEARNERS, updated);

    // Also remove associated assignments and attempts
    const assignments = this.getAssignments();
    const toRemoveAss = assignments.filter((a) => a.learnerId === learnerId);
    const remainingAss = assignments.filter((a) => a.learnerId !== learnerId);
    setStorageItem(STORAGE_KEYS.ASSIGNMENTS, remainingAss);

    const attempts = getStorageItem<BlueQuestionAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
    const removeAssIds = new Set(toRemoveAss.map((a) => a.id));
    const remainingAttempts = attempts.filter((att) => !removeAssIds.has(att.assignmentId));
    setStorageItem(STORAGE_KEYS.ATTEMPTS, remainingAttempts);
  }

  // Assignments
  static getAssignments(): BlueAssignment[] {
    return getStorageItem<BlueAssignment[]>(STORAGE_KEYS.ASSIGNMENTS, []);
  }

  static getAssignment(id: string): BlueAssignment | null {
    const assignments = this.getAssignments();
    return assignments.find((a) => a.id === id) || null;
  }

  static saveAssignment(assignment: BlueAssignment): void {
    const assignments = this.getAssignments();
    const index = assignments.findIndex((a) => a.id === assignment.id);
    if (index >= 0) {
      assignments[index] = assignment;
    } else {
      assignments.push(assignment);
    }
    setStorageItem(STORAGE_KEYS.ASSIGNMENTS, assignments);
  }

  static deleteAssignment(id: string): void {
    const assignments = this.getAssignments();
    const updated = assignments.filter((a) => a.id !== id);
    setStorageItem(STORAGE_KEYS.ASSIGNMENTS, updated);

    // Remove associated attempts
    const attempts = getStorageItem<BlueQuestionAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
    const remainingAttempts = attempts.filter((a) => a.assignmentId !== id);
    setStorageItem(STORAGE_KEYS.ATTEMPTS, remainingAttempts);
  }

  static clearAllHistory(): void {
    setStorageItem(STORAGE_KEYS.ASSIGNMENTS, []);
    setStorageItem(STORAGE_KEYS.ATTEMPTS, []);
    setStorageItem(STORAGE_KEYS.RUNS, []);
    setStorageItem(STORAGE_KEYS.EVENTS, []);
  }

  static createAssignment(
    learnerId: string,
    packageVersionId: string = 'blue-pkg-v1',
    assignedBy: string = 'Teacher',
    testMode: BlueTestMode = 'standard'
  ): BlueAssignment {
    const existing = this.getAssignments().find((a) => a.learnerId === learnerId && a.status !== 'completed');
    if (existing) {
      if (testMode && existing.testMode !== testMode) {
        existing.testMode = testMode;
        this.saveAssignment(existing);
      }
      return existing;
    }

    return this.createNewAssignment(learnerId, packageVersionId, assignedBy, testMode);
  }

  static createNewAssignment(
    learnerId: string,
    packageVersionId: string = 'blue-pkg-v1',
    assignedBy: string = 'Teacher',
    testMode: BlueTestMode = 'standard'
  ): BlueAssignment {
    const newAssignment: BlueAssignment = {
      id: `blue-assign-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      learnerId,
      packageVersionId,
      status: 'in_progress',
      assignedAt: new Date().toISOString(),
      assignedBy,
      currentGlobalOrder: 1,
      currentSessionNumber: 1,
      testMode,
    };

    this.saveAssignment(newAssignment);
    return newAssignment;
  }

  // Runs / Sessions
  static getSessionRuns(assignmentId: string): BlueSessionRun[] {
    const runs = getStorageItem<BlueSessionRun[]>(STORAGE_KEYS.RUNS, []);
    return runs.filter((r) => r.assignmentId === assignmentId);
  }

  static getOrCreateSessionRun(assignmentId: string, sessionNumber: number): BlueSessionRun {
    const runs = this.getSessionRuns(assignmentId);
    let run = runs.find((r) => r.sessionNumber === sessionNumber);
    if (!run) {
      run = {
        id: `blue-run-${assignmentId}-s${sessionNumber}`,
        assignmentId,
        sessionNumber,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
      };
      const allRuns = getStorageItem<BlueSessionRun[]>(STORAGE_KEYS.RUNS, []);
      allRuns.push(run);
      setStorageItem(STORAGE_KEYS.RUNS, allRuns);
    }
    return run;
  }

  // Question Attempts
  static getAttempts(assignmentId: string): BlueQuestionAttempt[] {
    const attempts = getStorageItem<BlueQuestionAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
    return attempts
      .filter((a) => a.assignmentId === assignmentId)
      .sort((a, b) => a.globalQuestionOrder - b.globalQuestionOrder);
  }

  static getAttemptByOrder(assignmentId: string, globalOrder: number): BlueQuestionAttempt | null {
    const attempts = this.getAttempts(assignmentId);
    return attempts.find((a) => a.globalQuestionOrder === globalOrder) || null;
  }

  // Audit Events
  static getAuditEvents(assignmentId: string): BlueAuditEvent[] {
    const events = getStorageItem<BlueAuditEvent[]>(STORAGE_KEYS.EVENTS, []);
    return events
      .filter((e) => e.assignmentId === assignmentId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * Finalizes a question attempt atomically and logs an audit event idempotently.
   */
  static finalizeAttempt(payload: {
    assignmentId: string;
    runId: string;
    questionId: string;
    globalQuestionOrder: number;
    sessionNumber: number;
    questionInSession: number;
    maxTimeSecondsRaw: number;
    startedAt: string;
    endedAt: string;
    elapsedSecondsRaw: number;
    completionRatio: number;
    derivedColorAtStop: SevenColor;
    effectiveColor: SevenColor;
    completionMode: CompletionMode;
    stoppedAtChallengeIndex?: number;
    actor?: string;
  }): { attempt: BlueQuestionAttempt; event: BlueAuditEvent } {
    const attempts = getStorageItem<BlueQuestionAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
    const events = getStorageItem<BlueAuditEvent[]>(STORAGE_KEYS.EVENTS, []);

    // Check idempotency: if attempt already finalized for this global order
    let attemptIndex = attempts.findIndex(
      (a) => a.assignmentId === payload.assignmentId && a.globalQuestionOrder === payload.globalQuestionOrder
    );

    const nowStr = new Date().toISOString();
    const actor = payload.actor || 'Teacher';

    let attempt: BlueQuestionAttempt;
    let sequence = events.filter((e) => e.assignmentId === payload.assignmentId).length + 1;

    if (attemptIndex >= 0 && attempts[attemptIndex].finalizedAt) {
      // Already finalized idempotently
      attempt = attempts[attemptIndex];
      if (payload.stoppedAtChallengeIndex !== undefined && attempt.stoppedAtChallengeIndex !== payload.stoppedAtChallengeIndex) {
        attempt.stoppedAtChallengeIndex = payload.stoppedAtChallengeIndex;
        attempts[attemptIndex] = attempt;
        setStorageItem(STORAGE_KEYS.ATTEMPTS, attempts);
      }
      const existingEvent = events.find((e) => e.attemptId === attempt.id && e.eventType === 'result_finalized');
      return {
        attempt,
        event: existingEvent || {
          id: `evt-idemp-${attempt.id}`,
          attemptId: attempt.id,
          assignmentId: payload.assignmentId,
          eventType: 'result_finalized',
          sequence,
          timestamp: attempt.finalizedAt,
          actor,
          details: {
            elapsedSecondsRaw: attempt.elapsedSecondsRaw,
            derivedColor: attempt.derivedColorAtStop,
            effectiveColor: attempt.effectiveColor,
            mode: attempt.completionMode,
          },
        },
      };
    }

    const attemptId = `blue-attempt-${payload.assignmentId}-q${payload.globalQuestionOrder}`;

    const { effectiveElapsedSeconds, effectiveCompletionRatio } = calculateEffectiveValues(
      payload.effectiveColor,
      payload.maxTimeSecondsRaw,
      payload.elapsedSecondsRaw,
      payload.completionRatio,
      payload.derivedColorAtStop
    );

    attempt = {
      id: attemptId,
      assignmentId: payload.assignmentId,
      runId: payload.runId,
      questionId: payload.questionId,
      globalQuestionOrder: payload.globalQuestionOrder,
      sessionNumber: payload.sessionNumber,
      questionInSession: payload.questionInSession,
      maxTimeSecondsRaw: payload.maxTimeSecondsRaw,
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      elapsedSecondsRaw: payload.elapsedSecondsRaw,
      completionRatio: payload.completionRatio,
      derivedColorAtStop: payload.derivedColorAtStop,
      effectiveColor: payload.effectiveColor,
      effectiveElapsedSeconds,
      effectiveCompletionRatio,
      completionMode: payload.completionMode,
      stoppedAtChallengeIndex: payload.stoppedAtChallengeIndex ?? payload.globalQuestionOrder,
      finalizedAt: nowStr,
      latestEventSequence: sequence,
    };

    if (attemptIndex >= 0) {
      attempts[attemptIndex] = attempt;
    } else {
      attempts.push(attempt);
    }

    let eventType: AuditEventType = 'result_finalized';
    if (payload.completionMode === 'auto_max') {
      eventType = 'auto_max_reached';
    } else if (payload.completionMode === 'manual_red') {
      eventType = 'manual_red_recorded';
    }

    const auditEvent: BlueAuditEvent = {
      id: `blue-evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      attemptId,
      assignmentId: payload.assignmentId,
      eventType,
      sequence,
      timestamp: nowStr,
      actor,
      details: {
        elapsedSecondsRaw: payload.elapsedSecondsRaw,
        derivedColor: payload.derivedColorAtStop,
        effectiveColor: payload.effectiveColor,
        mode: payload.completionMode,
      },
    };

    events.push(auditEvent);

    setStorageItem(STORAGE_KEYS.ATTEMPTS, attempts);
    setStorageItem(STORAGE_KEYS.EVENTS, events);

    // Update assignment current progress
    const assignment = this.getAssignment(payload.assignmentId);
    if (assignment) {
      if (payload.globalQuestionOrder >= 49) {
        assignment.status = 'completed';
        assignment.completedAt = nowStr;
      } else {
        assignment.currentGlobalOrder = payload.globalQuestionOrder + 1;
        assignment.currentSessionNumber = Math.ceil((payload.globalQuestionOrder + 1) / 7);
      }
      this.saveAssignment(assignment);
    }

    return { attempt, event: auditEvent };
  }

  static recordAttemptFinalized = BlueTestStorageAdapter.finalizeAttempt;

  /**
   * Corrects a finalized question attempt, appending an audit event and updating effective color.
   */
  static correctAttempt(payload: {
    attemptId: string;
    newEffectiveColor: SevenColor;
    reason: string;
    newStoppedAtChallengeIndex?: number;
    actor?: string;
  }): { attempt: BlueQuestionAttempt; event: BlueAuditEvent } {
    if (!payload.reason || !payload.reason.trim()) {
      throw new Error('Correction requires a non-empty reason.');
    }

    const attempts = getStorageItem<BlueQuestionAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
    const events = getStorageItem<BlueAuditEvent[]>(STORAGE_KEYS.EVENTS, []);

    const attemptIndex = attempts.findIndex((a) => a.id === payload.attemptId);
    if (attemptIndex < 0) {
      throw new Error(`Attempt with ID ${payload.attemptId} not found.`);
    }

    const attempt = attempts[attemptIndex];
    const previousColor = attempt.effectiveColor;
    const nowStr = new Date().toISOString();
    const actor = payload.actor || 'Teacher';

    const sequence = events.filter((e) => e.assignmentId === attempt.assignmentId).length + 1;

    const { effectiveElapsedSeconds, effectiveCompletionRatio } = calculateEffectiveValues(
      payload.newEffectiveColor,
      attempt.maxTimeSecondsRaw,
      attempt.elapsedSecondsRaw,
      attempt.completionRatio,
      attempt.derivedColorAtStop
    );

    attempt.effectiveColor = payload.newEffectiveColor;
    attempt.effectiveElapsedSeconds = effectiveElapsedSeconds;
    attempt.effectiveCompletionRatio = effectiveCompletionRatio;
    attempt.completionMode = 'correction';
    attempt.correctedAt = nowStr;
    attempt.correctionReason = payload.reason.trim();
    attempt.correctedBy = actor;
    attempt.latestEventSequence = sequence;
    if (payload.newStoppedAtChallengeIndex !== undefined) {
      attempt.stoppedAtChallengeIndex = payload.newStoppedAtChallengeIndex;
    }

    attempts[attemptIndex] = attempt;

    const auditEvent: BlueAuditEvent = {
      id: `blue-evt-corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      attemptId: attempt.id,
      assignmentId: attempt.assignmentId,
      eventType: 'result_corrected',
      sequence,
      timestamp: nowStr,
      actor,
      details: {
        previousColor,
        effectiveColor: payload.newEffectiveColor,
        effectiveElapsedSeconds,
        effectiveCompletionRatio,
        observedElapsedSecondsRaw: attempt.elapsedSecondsRaw,
        observedCompletionRatio: attempt.completionRatio,
        reason: payload.reason.trim(),
        mode: 'correction',
      },
    };

    events.push(auditEvent);

    setStorageItem(STORAGE_KEYS.ATTEMPTS, attempts);
    setStorageItem(STORAGE_KEYS.EVENTS, events);

    return { attempt, event: auditEvent };
  }

  /**
   * Resets/deletes a question attempt so that the learner can Try Again ("Làm lại")
   * and record a new result for that question (setting status to awaiting_start).
   */
  static tryAgainAttempt(assignmentId: string, globalQuestionOrder: number, actor: string = 'Teacher'): void {
    const attempts = getStorageItem<BlueQuestionAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
    const attemptIndex = attempts.findIndex(
      (a) => a.assignmentId === assignmentId && a.globalQuestionOrder === globalQuestionOrder
    );

    if (attemptIndex < 0) {
      return;
    }

    const targetAttempt = attempts[attemptIndex];
    attempts.splice(attemptIndex, 1);
    setStorageItem(STORAGE_KEYS.ATTEMPTS, attempts);

    // Update assignment status and current progress position
    const assignment = this.getAssignment(assignmentId);
    if (assignment) {
      if (assignment.status === 'completed') {
        assignment.status = 'in_progress';
        assignment.completedAt = undefined;
      }
      assignment.currentGlobalOrder = globalQuestionOrder;
      assignment.currentSessionNumber = Math.ceil(globalQuestionOrder / 7);
      this.saveAssignment(assignment);
    }

    // Record audit event for resetting the attempt
    const events = getStorageItem<BlueAuditEvent[]>(STORAGE_KEYS.EVENTS, []);
    const sequence = events.filter((e) => e.assignmentId === assignmentId).length + 1;
    const auditEvent: BlueAuditEvent = {
      id: `blue-evt-reset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      attemptId: targetAttempt.id,
      assignmentId,
      eventType: 'attempt_reset',
      sequence,
      timestamp: new Date().toISOString(),
      actor,
      details: {
        reason: `Try again / reset attempt for Question ${globalQuestionOrder} to awaiting_start`,
      },
    };
    events.push(auditEvent);
    setStorageItem(STORAGE_KEYS.EVENTS, events);
  }

  /**
   * Audio settings management with default OFF for autoplayPackageIntro/autoplayTestIntro
   */
  static getAudioSettings(): AudioSettings {
    const defaultSettings: AudioSettings = {
      autoplayPackageIntro: false, // Default: OFF for a user with no saved preference
      autoplayTestIntro: false,
      autoplaySessionIntro: false,
      autoplayQuestionNumber: true, // Default: ON so Question Number cue plays on transition
      autoplayPackageEnd: false,
      enableBells: true,
      hideStandardTestMode: false,
    };
    const saved = getStorageItem<Partial<AudioSettings>>(STORAGE_KEYS.AUDIO_SETTINGS, {});
    const autoplayTestIntro = saved.autoplayTestIntro ?? saved.autoplayPackageIntro ?? defaultSettings.autoplayPackageIntro;
    const autoplayQuestionNumber = saved.autoplayQuestionNumber ?? defaultSettings.autoplayQuestionNumber;
    return {
      ...defaultSettings,
      ...saved,
      autoplayPackageIntro: autoplayTestIntro,
      autoplayTestIntro,
      autoplayQuestionNumber,
      hideStandardTestMode: Boolean(saved.hideStandardTestMode),
    };
  }

  static saveAudioSettings(settings: AudioSettings): AudioSettings {
    const autoplayTestIntro = settings.autoplayTestIntro ?? settings.autoplayPackageIntro;
    const normalized: AudioSettings = {
      ...settings,
      autoplayPackageIntro: autoplayTestIntro,
      autoplayTestIntro,
      autoplayQuestionNumber: settings.autoplayQuestionNumber ?? true,
      hideStandardTestMode: Boolean(settings.hideStandardTestMode),
    };
    setStorageItem(STORAGE_KEYS.AUDIO_SETTINGS, normalized);
    return normalized;
  }

  static hasPlayedPkgIntro(assignmentId: string): boolean {
    const map = getStorageItem<Record<string, boolean>>(STORAGE_KEYS.PLAYED_INTROS, {});
    return Boolean(map[assignmentId]);
  }

  static markPkgIntroPlayed(assignmentId: string): void {
    const map = getStorageItem<Record<string, boolean>>(STORAGE_KEYS.PLAYED_INTROS, {});
    map[assignmentId] = true;
    setStorageItem(STORAGE_KEYS.PLAYED_INTROS, map);
  }

  /**
   * Resets all Blue Test data (for testing/demo purposes).
   */
  static clearAllBlueData(): void {
    memoryStorage.clear();
    setStorageItem(STORAGE_KEYS.LEARNERS, DEFAULT_LEARNERS);
    setStorageItem(STORAGE_KEYS.ASSIGNMENTS, []);
    setStorageItem(STORAGE_KEYS.RUNS, []);
    setStorageItem(STORAGE_KEYS.ATTEMPTS, []);
    setStorageItem(STORAGE_KEYS.EVENTS, []);
  }
}
