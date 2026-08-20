import { getClockPhase, ClockPhase } from '../../domain/blue-test/clock-engine';
import { NarrationQueueState } from '../../audio/audio-service';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  AudioSettings,
  BlueAssignment,
  BlueQuestionAttempt,
  BlueQuestionDefinition,
  NarrationLocationKey,
  QuestionState,
  SevenColor,
} from '../../types/blue-test';
import { Learner } from '../../types/common';
import { generateDefaultBluePackage, predictChallengeIndexFromElapsed } from '../../domain/blue-test/timing-engine';
import { deriveSevenColor, getSevenColorDefinition, SEVEN_COLORS_ORDERED } from '../../domain/blue-test/color-engine';
import { BlueTestStorageAdapter } from '../../persistence/blue-test-storage';
import { AudioStorageAdapter, DEFAULT_NARRATION_SCRIPTS } from '../../persistence/audio-storage';
import {
  playStartBell, playEndBell, playClockLoop, stopClockLoop,
  playNarrationAssetOrSpeech,
  pauseNarration,
  resumeNarration,
  restartNarration,
  stopNarration,
  stopAllAudio,
  NarrationStatus,
  narrationQueue,
  NarrationQueueItem,
} from '../../audio/audio-service';
import { LearnerAvatar } from '../common/LearnerAvatar';
import { BlueTestRail } from './BlueTestRail';
import { BlueTestCorrectionModal } from './BlueTestCorrectionModal';
import { BlueTestResultReview } from './BlueTestResultReview';
import { BlueTestFaceIndicator } from './BlueTestFaceIndicator';
import {
  Play,
  Pause,
  Square,
  AlertTriangle,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Award,
  CheckCircle2,
  Info,
  ListOrdered,
  Maximize2,
  Minimize2,
  Eye,
  X,
} from 'lucide-react';

interface BlueTestRoomProps {
  learner: Learner;
  assignment: BlueAssignment;
  audioSettings: AudioSettings;
  onUpdateAudioSettings?: (settings: AudioSettings) => void;
  onFinishTest: () => void;
  onOpenAnalysis: () => void;
}

export const BlueTestRoom: React.FC<BlueTestRoomProps> = ({
  learner,
  assignment,
  audioSettings,
  onUpdateAudioSettings,
  onFinishTest,
  onOpenAnalysis,
}) => {
  const pkg = useMemo(() => generateDefaultBluePackage(), []);

  const [currentGlobalOrder, setCurrentGlobalOrder] = useState<number>(assignment.currentGlobalOrder || 1);
  const [questionState, setQuestionState] = useState<QuestionState>('awaiting_start');
  const [attempts, setAttempts] = useState<BlueQuestionAttempt[]>(() =>
    BlueTestStorageAdapter.getAttempts(assignment.id)
  );

  // Active result review attempt when in result_review state
  const [activeReviewAttempt, setActiveReviewAttempt] = useState<BlueQuestionAttempt | null>(null);

  // Correction modal state
  const [editingAttempt, setEditingAttempt] = useState<BlueQuestionAttempt | null>(null);

  // False Start / Manual Red modal state
  const [showFalseStartConfirm, setShowFalseStartConfirm] = useState<boolean>(false);

  // Persistence error state
  const [hasPersistenceError, setHasPersistenceError] = useState<boolean>(false);

  // Rail collapsed state
  const [isRailCollapsed, setIsRailCollapsed] = useState<boolean>(false);

  // Focus Mode state for active measurement canvas
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Current Question
  const currentQuestion: BlueQuestionDefinition =
    pkg.questions.find((q) => q.globalOrder === currentGlobalOrder) || pkg.questions[0];

  const currentSessionNumber = currentQuestion.sessionNumber;
  const currentSessionIntro = pkg.sessionIntros.find((s) => s.sessionNumber === currentSessionNumber);

  // Timer states & refs
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const activeClockPhaseRef = useRef<ClockPhase>('none');
  const startBellActiveRef = useRef<boolean>(false);
  const getClockUrl = (phase: ClockPhase) => {
    if (phase === 'none') return null;
    return (
      AudioStorageAdapter.getActiveVersion('blue_test_clock_medium')?.audioUrl ||
      AudioStorageAdapter.getActiveVersion('blue_test_clock_slow')?.audioUrl ||
      AudioStorageAdapter.getActiveVersion('blue_test_clock_urgent')?.audioUrl ||
      null
    );
  };
  const wallStartedAtRef = useRef<string | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Tracking played narrations
  const spokenSessionIntrosRef = useRef<number | null>(null);
  const spokenQuestionNumbersRef = useRef<number | null>(null);
  const spokenQuestionCuesRef = useRef<number | null>(null);
  const [narrationQueueState, setNarrationQueueState] = useState<NarrationQueueState>('idle');
  const [narrationStatus, setNarrationStatus] = useState<NarrationStatus>({
    isPlaying: false,
    isPaused: false,
    hasError: false,
  });

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, []);

  // Subscribe to central narrationQueue status and AudioStorage updates
  const [, setAudioStorageUpdateCount] = useState(0);
  useEffect(() => {
    AudioStorageAdapter.syncFromCloud().then(() => {
      setAudioStorageUpdateCount((c) => c + 1);
    });
    const unsubStorage = AudioStorageAdapter.subscribe(() => {
      setAudioStorageUpdateCount((c) => c + 1);
    });
    const unsubscribe = narrationQueue.subscribe((state, currentItem) => {
      setNarrationQueueState(state);
      setNarrationStatus({
        isPlaying: state === 'playing',
        isPaused: state === 'paused',
        hasError: state === 'failed',
        title: currentItem?.title || '',
        text: currentItem?.text || '',
        audioUrl: currentItem?.audioUrl || null,
      });
    });
    return () => {
      unsubStorage();
      unsubscribe();
    };
  }, []);

  // Manual trigger handlers with explicit titles routed through narrationQueue
  const handlePlayTestIntro = useCallback(() => {
    const activePkgAsset = AudioStorageAdapter.getActiveVersion('pkg_intro');
    const pkgIntroText = pkg.packageIntroText || DEFAULT_NARRATION_SCRIPTS.pkg_intro.spokenScript;
    narrationQueue.clearAndEnqueue({
      id: `manual_test_intro_${assignment.id}`,
      kind: 'test_intro',
      targetKey: 'pkg_intro',
      title: 'Blue Test Intro',
      assignmentId: assignment.id,
      text: pkgIntroText,
      audioUrl: activePkgAsset ? activePkgAsset.audioUrl : null,
    });
  }, [assignment.id, pkg.packageIntroText]);

  const handlePlaySessionIntro = useCallback(
    (sessionNum: number) => {
      const locKey = `session_${sessionNum}_intro` as NarrationLocationKey;
      const activeAsset = AudioStorageAdapter.getActiveVersion(locKey);
      const text = activeAsset?.scriptText || currentSessionIntro?.narrationText || DEFAULT_NARRATION_SCRIPTS[locKey]?.spokenScript || DEFAULT_NARRATION_SCRIPTS[locKey]?.defaultScript || `Session ${sessionNum} Intro`;
      narrationQueue.clearAndEnqueue({
        id: `manual_session_intro_${sessionNum}_${assignment.id}`,
        kind: 'session_intro',
        targetKey: locKey,
        title: `Session ${sessionNum} Intro`,
        assignmentId: assignment.id,
        sessionNumber: sessionNum,
        text,
        audioUrl: activeAsset ? activeAsset.audioUrl : null,
      });
    },
    [assignment.id, currentSessionIntro]
  );

  // Helper to play global Challenge audio cue (1..49)
  const playChallengeCue = useCallback((globalOrder: number, numInSession: number) => {
    const padded = globalOrder < 10 ? '0' + globalOrder : globalOrder;
    const locKey = `blue_test_challenge_${padded}` as NarrationLocationKey;
    const config = DEFAULT_NARRATION_SCRIPTS[locKey];
    const activeAsset = AudioStorageAdapter.getActiveVersion(locKey);
    const spokenText = config?.spokenScript || `Challenge ${globalOrder}.`;

    narrationQueue.clearAndEnqueue({
      id: `manual_challenge_cue_${globalOrder}_${assignment.id}`,
      kind: 'question_number',
      targetKey: locKey,
      title: `Challenge ${globalOrder} Cue`,
      assignmentId: assignment.id,
      sessionQuestionNumber: numInSession,
      text: spokenText,
      audioUrl: activeAsset ? activeAsset.audioUrl : null,
    });
  }, [assignment.id]);

  // Screen reader aria-live announcement
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>('');

  const announce = useCallback((msg: string) => {
    setAriaAnnouncement(msg);
  }, []);

  // Sync attempts from storage
  const reloadAttempts = useCallback(() => {
    const updated = BlueTestStorageAdapter.getAttempts(assignment.id);
    setAttempts(updated);
  }, [assignment.id]);

  // Restore attempt if reloading while in result_review
  useEffect(() => {
    const existingAttempt = BlueTestStorageAdapter.getAttemptByOrder(assignment.id, currentGlobalOrder);
    if (existingAttempt && existingAttempt.finalizedAt) {
      setActiveReviewAttempt(existingAttempt);
      setQuestionState('result_review');
    }
  }, [assignment.id, currentGlobalOrder]);

  // Handle Package Intro, Session Intros, and Question Number Audio Cues Autoplay Queue
  useEffect(() => {
    if (questionState !== 'awaiting_start') return;

    const globalOrd = currentGlobalOrder;
    const sessionNum = currentSessionNumber;
    const qNumInSession = currentQuestion.questionInSession;

    const itemsToEnqueue: NarrationQueueItem[] = [];

    const isAutoplayTestIntroEnabled = Boolean(
      audioSettings.autoplayTestIntro ?? audioSettings.autoplayPackageIntro
    );
    const hasAlreadyPlayedTestIntro = BlueTestStorageAdapter.hasPlayedPkgIntro(assignment.id);

    // 1. Package Intro / Test Intro (Q1 initial launch)
    if (globalOrd === 1 && isAutoplayTestIntroEnabled && !hasAlreadyPlayedTestIntro) {
      BlueTestStorageAdapter.markPkgIntroPlayed(assignment.id);
      const activePkgAsset = AudioStorageAdapter.getActiveVersion('pkg_intro');
      const pkgIntroText = pkg.packageIntroText || DEFAULT_NARRATION_SCRIPTS.pkg_intro.spokenScript;
      itemsToEnqueue.push({
        id: `test_intro_${assignment.id}`,
        kind: 'test_intro',
        targetKey: 'pkg_intro',
        title: 'Blue Test Intro',
        assignmentId: assignment.id,
        globalOrder: 1,
        text: pkgIntroText,
        audioUrl: activePkgAsset ? activePkgAsset.audioUrl : null,
      });
    }

    // 2. Session Intros (Question 1 of each session 1..7)
    if (
      qNumInSession === 1 &&
      audioSettings.autoplaySessionIntro &&
      currentSessionIntro &&
      spokenSessionIntrosRef.current !== sessionNum
    ) {
      spokenSessionIntrosRef.current = sessionNum;
      const sessKey = `session_${sessionNum}_intro` as NarrationLocationKey;
      const activeSessAsset = AudioStorageAdapter.getActiveVersion(sessKey);
      itemsToEnqueue.push({
        id: `session_intro_${sessionNum}_${assignment.id}`,
        kind: 'session_intro',
        targetKey: sessKey,
        title: `Session ${sessionNum} Intro`,
        assignmentId: assignment.id,
        sessionNumber: sessionNum,
        sessionQuestionNumber: 1,
        globalOrder: globalOrd,
        text: activeSessAsset?.scriptText || currentSessionIntro.narrationText || DEFAULT_NARRATION_SCRIPTS[sessKey]?.spokenScript || DEFAULT_NARRATION_SCRIPTS[sessKey]?.defaultScript || `Session ${sessionNum} Intro`,
        audioUrl: activeSessAsset ? activeSessAsset.audioUrl : null,
      });
    }

    // 3. Challenge Audio Cue (1..49 global order mapped to blue_test_challenge_01..49)
    if (
      (audioSettings.autoplayQuestionNumber !== false || audioSettings.autoplayChallengeAudio) &&
      spokenQuestionNumbersRef.current !== globalOrd
    ) {
      spokenQuestionNumbersRef.current = globalOrd;
      const padded = globalOrd < 10 ? '0' + globalOrd : globalOrd;
      const cueKey = `blue_test_challenge_${padded}` as NarrationLocationKey;
      const activeCueAsset = AudioStorageAdapter.getActiveVersion(cueKey);
      const config = DEFAULT_NARRATION_SCRIPTS[cueKey];
      const spokenText = config?.spokenScript || `Challenge ${globalOrd}.`;
      itemsToEnqueue.push({
        id: `manual_challenge_cue_${globalOrd}_${assignment.id}`,
        kind: 'question_number',
        targetKey: cueKey,
        title: `Challenge ${globalOrd} Cue`,
        assignmentId: assignment.id,
        sessionNumber: sessionNum,
        sessionQuestionNumber: qNumInSession,
        globalOrder: globalOrd,
        text: spokenText,
        audioUrl: activeCueAsset ? activeCueAsset.audioUrl : null,
      });
    }

    
    if (itemsToEnqueue.length > 0) {
      narrationQueue.clearAndEnqueue(itemsToEnqueue);
    }
  }, [
    assignment.id,
    currentGlobalOrder,
    currentSessionNumber,
    currentQuestion.questionInSession,
    currentQuestion.promptText,
    currentSessionIntro,
    questionState,
    audioSettings.autoplayPackageIntro,
    audioSettings.autoplayTestIntro,
    audioSettings.autoplaySessionIntro,
    audioSettings.autoplayQuestionNumber,
    audioSettings.autoplayChallengeAudio,
    audioSettings.autoplayQuestionCue,
    pkg.packageIntroText,
  ]);

  // Derived current color
  const activeDerivedColor: SevenColor = deriveSevenColor(elapsedSeconds, currentQuestion.maxTimeSecondsRaw);
  const activeColorDef = getSevenColorDefinition(activeDerivedColor);

  // Timestamp when question was finalized to prevent rapid double-tap advancing
  const lastFinalizedAtRef = useRef<number>(0);

  // Finalize question handler
  const finalizeQuestion = useCallback(
    (
      mode: 'manual_end' | 'auto_max' | 'manual_red',
      overrideElapsed?: number,
      stoppedAtChallengeIndex?: number
    ) => {
      if (questionState !== 'running' && questionState !== 'awaiting_start') return;

      lastFinalizedAtRef.current = Date.now();

      // Stop clock tick loop immediately on question completion
      stopClockLoop();
      activeClockPhaseRef.current = 'none';

      setQuestionState('finalizing');
      setHasPersistenceError(false);

      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      const finalElapsed = overrideElapsed !== undefined ? overrideElapsed : elapsedSeconds;
      const finalRatio = Math.max(0, Math.min(1, finalElapsed / currentQuestion.maxTimeSecondsRaw));
      const derivedColor = deriveSevenColor(finalElapsed, currentQuestion.maxTimeSecondsRaw);
      const effectiveColor = mode === 'manual_red' ? 'red' : derivedColor;

      const predictedChallenge = predictChallengeIndexFromElapsed(
        finalElapsed,
        currentQuestion.maxTimeSecondsRaw,
        currentQuestion.globalOrder
      );

      try {
        const run = BlueTestStorageAdapter.getOrCreateSessionRun(assignment.id, currentQuestion.sessionNumber);

        const { attempt } = BlueTestStorageAdapter.finalizeAttempt({
          assignmentId: assignment.id,
          runId: run.id,
          questionId: currentQuestion.id,
          globalQuestionOrder: currentQuestion.globalOrder,
          sessionNumber: currentQuestion.sessionNumber,
          questionInSession: currentQuestion.questionInSession,
          maxTimeSecondsRaw: currentQuestion.maxTimeSecondsRaw,
          startedAt: wallStartedAtRef.current || new Date().toISOString(),
          endedAt: new Date().toISOString(),
          elapsedSecondsRaw: finalElapsed,
          completionRatio: finalRatio,
          derivedColorAtStop: derivedColor,
          effectiveColor,
          completionMode: mode,
          stoppedAtChallengeIndex: stoppedAtChallengeIndex ?? predictedChallenge,
        });

        if (audioSettings.enableBells) {
          playEndBell();
        }

        announce(
          `Question ${currentQuestion.globalOrder} finalized as ${effectiveColor.toUpperCase()}. Elapsed time ${finalElapsed.toFixed(
            1
          )} seconds.`
        );

        reloadAttempts();
        setActiveReviewAttempt(attempt);
        setQuestionState('result_review');
      } catch (e) {
        console.error('Error finalizing attempt:', e);
        setHasPersistenceError(true);
        setQuestionState('error');
      }
    },
    [
      questionState,
      elapsedSeconds,
      currentQuestion,
      assignment.id,
      audioSettings,
      announce,
      reloadAttempts,
    ]
  );

  const handleEndTest = useCallback(() => {
    stopNarration();
    const activeEndAsset = AudioStorageAdapter.getActiveVersion('pkg_end');
    const endText = pkg.packageEndText || DEFAULT_NARRATION_SCRIPTS.pkg_end.spokenScript;
    narrationQueue.clearAndEnqueue({
      id: `end_test_${assignment.id}`,
      kind: 'test_end',
      targetKey: 'pkg_end',
      title: 'Blue Test End',
      assignmentId: assignment.id,
      text: endText,
      audioUrl: activeEndAsset ? activeEndAsset.audioUrl : null,
    });
    const existing = BlueTestStorageAdapter.getAttemptByOrder(assignment.id, currentGlobalOrder);
    if (existing && existing.finalizedAt) {
      setActiveReviewAttempt(existing);
      setQuestionState('result_review');
    } else {
      setQuestionState('result_review');
    }
    setIsMobileDrawerOpen(false);
  }, [assignment.id, currentGlobalOrder, pkg.packageEndText]);

  const finalizeQuestionRef = useRef(finalizeQuestion);
  useEffect(() => {
    finalizeQuestionRef.current = finalizeQuestion;
  }, [finalizeQuestion]);

  // Timer loop with requestAnimationFrame
  const updateTimer = useCallback(() => {
    if (!startTimeRef.current) return;
    const now = performance.now();
    const elapsed = (now - startTimeRef.current) / 1000;

    if (elapsed >= currentQuestion.maxTimeSecondsRaw) {
      setElapsedSeconds(currentQuestion.maxTimeSecondsRaw);
      finalizeQuestionRef.current('auto_max', currentQuestion.maxTimeSecondsRaw);
    } else {
      setElapsedSeconds(elapsed);
      animFrameRef.current = requestAnimationFrame(updateTimer);
      
      if (audioSettings.timerSoundEnabled) {
        const nextPhase = getClockPhase(currentQuestion.maxTimeSecondsRaw, elapsed);
        if (nextPhase !== activeClockPhaseRef.current) {
          activeClockPhaseRef.current = nextPhase;
          if (nextPhase === 'none') {
            stopClockLoop();
          } else {
            const url = getClockUrl(nextPhase);
            if (url) playClockLoop(url, audioSettings.timerSoundVolume ?? 0.5);
          }
        }
      }
    }
  }, [currentQuestion.maxTimeSecondsRaw, audioSettings]);

  // Start Bell Handler
  const handleStartBell = useCallback(() => {
    if (questionState !== 'awaiting_start') return;

    narrationQueue.clearQueue();
    setQuestionState('running');
    setElapsedSeconds(0);
    const nowPerf = performance.now();
    startTimeRef.current = nowPerf;
    wallStartedAtRef.current = new Date().toISOString();
    activeClockPhaseRef.current = 'none';
    stopClockLoop();

    startBellActiveRef.current = true;
    if (audioSettings.enableBells) {
      playStartBell().then(() => {
        startBellActiveRef.current = false;
      });
    } else {
      startBellActiveRef.current = false;
    }

    // Play clock sound concurrently right at Start!
    if (audioSettings.timerSoundEnabled) {
      const initPhase = getClockPhase(currentQuestion.maxTimeSecondsRaw, 0);
      if (initPhase !== 'none') {
        activeClockPhaseRef.current = initPhase;
        const url = getClockUrl(initPhase);
        if (url) playClockLoop(url, audioSettings.timerSoundVolume ?? 0.5);
      }
    }

    announce(`Start Bell pressed for Question ${currentQuestion.globalOrder}. Timer is running.`);
    animFrameRef.current = requestAnimationFrame(updateTimer);
  }, [questionState, audioSettings, currentQuestion.globalOrder, announce, updateTimer]);

  // End Bell Handler
  const handleEndBell = useCallback(() => {
    if (questionState !== 'running') return;
    const nowPerf = performance.now();
    const finalElapsed = startTimeRef.current ? (nowPerf - startTimeRef.current) / 1000 : elapsedSeconds;
    finalizeQuestion('manual_end', finalElapsed);
  }, [questionState, elapsedSeconds, finalizeQuestion]);

  // False Start / Manual Red Handler
  const handleConfirmFalseStart = useCallback(() => {
    setShowFalseStartConfirm(false);
    if (questionState !== 'running') return;
    const nowPerf = performance.now();
    const finalElapsed = startTimeRef.current ? (nowPerf - startTimeRef.current) / 1000 : elapsedSeconds;
    finalizeQuestion('manual_red', finalElapsed);
  }, [questionState, elapsedSeconds, finalizeQuestion]);

  // Advance to Next Question Handler from Result Review
  const handleNextQuestion = useCallback(() => {
    if (currentGlobalOrder >= 49) {
      onOpenAnalysis();
      return;
    }

    const nextOrder = currentGlobalOrder + 1;
    setCurrentGlobalOrder(nextOrder);

    // Check if next question already has finalized attempt
    const existingAttempt = BlueTestStorageAdapter.getAttemptByOrder(assignment.id, nextOrder);
    if (existingAttempt && existingAttempt.finalizedAt) {
      setActiveReviewAttempt(existingAttempt);
      setQuestionState('result_review');
    } else {
      setActiveReviewAttempt(null);
      setQuestionState('awaiting_start');
      setElapsedSeconds(0);
      startTimeRef.current = null;
    }
  }, [currentGlobalOrder, assignment.id, onOpenAnalysis]);

  // Try Again / Reset Question Attempt Handler
  const handleTryAgainQuestion = useCallback(
    (globalOrder: number) => {
      BlueTestStorageAdapter.tryAgainAttempt(assignment.id, globalOrder);
      reloadAttempts();
      setCurrentGlobalOrder(globalOrder);
      setActiveReviewAttempt(null);
      setEditingAttempt(null);
      setQuestionState('awaiting_start');
      setElapsedSeconds(0);
      startTimeRef.current = null;
      announce(`Question ${globalOrder} reset to un-executed state. Ready to try again.`);
    },
    [assignment.id, reloadAttempts, announce]
  );

  // Keyboard Space listener for running/start states
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;

      // Do NOT intercept if typing in inputs/textareas/dialogs
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      if (showFalseStartConfirm || editingAttempt) return;

      // Prevent Spacebar from triggering within 1.5 seconds of finalization
      if (Date.now() - lastFinalizedAtRef.current < 1500) {
        e.preventDefault();
        return;
      }

      if (questionState === 'awaiting_start') {
        e.preventDefault();
        narrationQueue.clearQueue();
        stopNarration();
        handleStartBell();
      } else if (questionState === 'running') {
        e.preventDefault();
        handleEndBell();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [questionState, handleStartBell, handleEndBell, showFalseStartConfirm, editingAttempt]);

  // Stop clock sound whenever questionState is not 'running'
  useEffect(() => {
    if (questionState !== 'running') {
      stopClockLoop();
      activeClockPhaseRef.current = 'none';
    }
  }, [questionState]);

  // Cleanup animation frame and clock sound on unmount
  useEffect(() => {
    return () => {
      stopClockLoop();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Escape key listener for exiting Focus Mode
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocusMode) {
        setIsFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFocusMode]);

  // Correction save handler
  const handleSaveCorrection = (
    newColor: SevenColor,
    reason: string,
    newStoppedAtChallengeIndex?: number
  ) => {
    if (!editingAttempt) return;
    try {
      const { attempt } = BlueTestStorageAdapter.correctAttempt({
        attemptId: editingAttempt.id,
        newEffectiveColor: newColor,
        reason,
        newStoppedAtChallengeIndex,
        actor: 'Teacher',
      });
      setEditingAttempt(null);
      if (activeReviewAttempt && activeReviewAttempt.id === attempt.id) {
        setActiveReviewAttempt(attempt);
      }
      reloadAttempts();
      announce(`Result corrected to ${newColor.toUpperCase()} for Question ${editingAttempt.globalQuestionOrder}.`);
    } catch (err) {
      console.error('Error saving correction:', err);
    }
  };

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);

  const isCompleted = currentGlobalOrder >= 49 && attempts.length >= 49 && questionState !== 'running';

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 bg-slate-950 text-white overflow-hidden relative">
      {/* Aria-Live Region for Accessibility */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ariaAnnouncement}
      </div>

      {/* Desktop Left Question Tracking Rail */}
      <div className="hidden lg:block shrink-0 h-full min-h-0 overflow-y-auto">
        <BlueTestRail
          audioSettings={audioSettings}
          onUpdateAudioSettings={onUpdateAudioSettings}
          currentGlobalOrder={currentGlobalOrder}
          attempts={attempts}
          onSelectQuestion={(qNum) => {
            if (questionState !== 'running') {
              setCurrentGlobalOrder(qNum);
              const existing = BlueTestStorageAdapter.getAttemptByOrder(assignment.id, qNum);
              if (existing && existing.finalizedAt) {
                setActiveReviewAttempt(existing);
                setQuestionState('result_review');
              } else {
                setActiveReviewAttempt(null);
                setQuestionState('awaiting_start');
                setElapsedSeconds(0);
              }
            }
          }}
          onOpenCorrection={(att) => setEditingAttempt(att)}
          isCollapsed={isRailCollapsed}
          onToggleCollapse={() => setIsRailCollapsed(!isRailCollapsed)}
          isTimerRunning={questionState === 'running'}
          packageIntroText={pkg.packageIntroText}
          packageEndText={pkg.packageEndText}
          learner={learner}
          currentQuestionInSession={currentQuestion.questionInSession}
          currentSessionIntro={currentSessionIntro}
          narrationStatus={narrationStatus}
          onPauseNarration={pauseNarration}
          onResumeNarration={resumeNarration}
          onRestartNarration={restartNarration}
          onStopNarration={() => {
            stopNarration();
            setNarrationStatus({ isPlaying: false, isPaused: false, hasError: false });
          }}
          onPlayTestIntro={handlePlayTestIntro}
          onPlaySessionIntro={handlePlaySessionIntro}
          onEndTest={handleEndTest}
        />
      </div>

      {/* Mobile / Tablet Question Tracking Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative z-10 w-80 max-w-[85vw] bg-slate-900 h-full shadow-2xl flex flex-col border-r border-slate-800">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <span className="font-bold text-xs text-white">49-Question Navigation</span>
              <button
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <BlueTestRail
                currentGlobalOrder={currentGlobalOrder}
                attempts={attempts}
                onSelectQuestion={(qNum) => {
                  if (questionState !== 'running') {
                    setCurrentGlobalOrder(qNum);
                    setIsMobileDrawerOpen(false);
                    const existing = BlueTestStorageAdapter.getAttemptByOrder(assignment.id, qNum);
                    if (existing && existing.finalizedAt) {
                      setActiveReviewAttempt(existing);
                      setQuestionState('result_review');
                    } else {
                      setActiveReviewAttempt(null);
                      setQuestionState('awaiting_start');
                      setElapsedSeconds(0);
                    }
                  }
                }}
                onOpenCorrection={(att) => {
                  setIsMobileDrawerOpen(false);
                  setEditingAttempt(att);
                }}
                isCollapsed={false}
                isTimerRunning={questionState === 'running'}
                packageIntroText={pkg.packageIntroText}
                packageEndText={pkg.packageEndText}
                learner={learner}
                currentQuestionInSession={currentQuestion.questionInSession}
                currentSessionIntro={currentSessionIntro}
                narrationStatus={narrationStatus}
                audioSettings={audioSettings}
                onPauseNarration={pauseNarration}
                onResumeNarration={resumeNarration}
                onRestartNarration={restartNarration}
                onStopNarration={() => {
                  stopNarration();
                  setNarrationStatus({ isPlaying: false, isPaused: false, hasError: false });
                }}
                onPlayTestIntro={handlePlayTestIntro}
                onPlaySessionIntro={handlePlaySessionIntro}
                onEndTest={handleEndTest}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <main className="flex-1 min-w-0 flex flex-col overflow-y-auto bg-slate-950 p-3 sm:p-5 lg:p-6 space-y-4">
        {/* Workspace Quick Control Top Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2.5 sm:p-4 flex items-center justify-between gap-2 sm:gap-3 shadow-md">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile Rail Trigger Button */}
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="lg:hidden px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] sm:text-xs font-bold border border-slate-700 flex items-center gap-1 sm:gap-1.5 shrink-0"
            >
              <ListOrdered className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
              <span>Rail (Q{currentGlobalOrder})</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="text-[11px] sm:text-sm font-extrabold text-white truncate">
                  Session {currentSessionNumber}/7
                </span>
                <span className="px-1.5 py-0.5 sm:px-2 text-[9px] sm:text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
                  Q{currentQuestion.questionInSession}/7 (Q{currentGlobalOrder}/49)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Focus Mode Button */}
            <button
              onClick={() => setIsFocusMode(true)}
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-indigo-950 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-500/30 text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-all shadow-xs"
              title="Enlarge active measurement canvas (Focus Mode)"
            >
              <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Focus View</span>
            </button>
          </div>
        </div>

        {/* Result Review State Overlay / Panel */}
        {questionState === 'result_review' && activeReviewAttempt ? (
          <BlueTestResultReview
            attempt={activeReviewAttempt}
            totalQuestions={49}
            onNextQuestion={handleNextQuestion}
            onOpenCorrection={() => setEditingAttempt(activeReviewAttempt)}
            onTryAgain={() => handleTryAgainQuestion(activeReviewAttempt.globalQuestionOrder)}
            onReplayEndBell={audioSettings.enableBells ? playEndBell : undefined}
            isErrorState={hasPersistenceError}
            onRetrySave={() => finalizeQuestion('manual_end')}
            onUpdateAttempt={(updated) => {
              setActiveReviewAttempt(updated);
              reloadAttempts();
            }}
          />
        ) : isCompleted ? (
          /* Test Completion Banner */
          <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-slate-900 border border-blue-500/40 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center mx-auto border border-blue-400/30 shadow-inner">
              <Award className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-white">49-Question Blue Test Completed!</h3>
            <p className="text-sm text-slate-300 max-w-lg mx-auto">
              All 7 sessions are finalized. You can now analyze %i metrics, review session distributions, or perform corrections.
            </p>
            <div className="flex items-center justify-center gap-4 pt-2">
              <button
                onClick={onOpenAnalysis}
                className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-xl transition-all"
              >
                View Full %i Analysis
              </button>
            </div>
          </div>
        ) : (
          /* Central Measurement Area */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 space-y-3.5 sm:space-y-5 shadow-xl relative h-auto min-h-fit overflow-visible">
            {/* Question Header & TCT (Threshold Conscious Time) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 border-b border-slate-800 pb-3 sm:pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-blue-400">
                    Session {currentSessionNumber} — Q{currentQuestion.questionInSession}
                  </span>
                  <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold bg-slate-800 text-slate-300 rounded">
                    Global Q{currentGlobalOrder}
                  </span>
                  <button
                    onClick={() => {
                      if (questionState === 'running') return;
                      playChallengeCue(currentGlobalOrder, currentQuestion.questionInSession);
                    }}
                    disabled={questionState === 'running'}
                    className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/50 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                    title={`Replay cue: Number ${currentQuestion.questionInSession}`}
                    aria-label={`Replay audio cue for number ${currentQuestion.questionInSession}`}
                  >
                    <Volume2 className="w-3 h-3 text-indigo-400" />
                    <span>Cue #{currentQuestion.questionInSession}</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-800 text-left sm:text-right shrink-0 flex sm:flex-col justify-between sm:justify-start items-center sm:items-end">
                <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium block" title="Threshold Conscious Time">TCT (Threshold Conscious Time)</span>
                <div className="text-right">
                  <span className="text-lg sm:text-2xl font-mono font-black text-blue-400 leading-none">
                    {currentQuestion.maxTimeDisplay}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-slate-500 block font-mono">
                    ({currentQuestion.maxTimeSecondsRaw.toFixed(4)}s raw)
                  </span>
                </div>
              </div>
            </div>

            {/* Live Timer Display & Active Color Label */}
            <div className="text-center space-y-2 py-1">
              <div className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-1.5 sm:py-2 bg-slate-950 rounded-xl sm:rounded-2xl border border-slate-800 shadow-inner">
                <span className="text-[11px] sm:text-xs text-slate-400 font-semibold" title="Max Conscious Time">MCT:</span>
                <span className="text-2xl sm:text-4xl font-mono font-black text-white tracking-wider">
                  {elapsedSeconds.toFixed(1)}s
                </span>
              </div>

              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <span className="text-[11px] sm:text-xs text-slate-400 font-medium">Active Band:</span>
                <span
                  className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-black text-white shadow-md transition-all duration-150"
                  style={{ backgroundColor: activeColorDef.hex }}
                >
                  {activeColorDef.labelEn}
                </span>
              </div>
            </div>

            {/* Expressive Running Face Indicator & 7-Segment Color Progress Track */}
            <BlueTestFaceIndicator
              completionRatio={elapsedSeconds / currentQuestion.maxTimeSecondsRaw}
              activeColor={activeDerivedColor}
              maxTimeDisplay={currentQuestion.maxTimeDisplay}
              isStopped={questionState !== 'running'}
            />

            {/* Shortcut Hint & Action Buttons */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              {/* Shortcut hint badge */}
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/80 w-fit mx-auto">
                <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-200 font-bold">Spacebar</span>
                <span>
                  {questionState === 'awaiting_start'
                    ? (['loading', 'playing', 'paused', 'blocked'].includes(narrationQueueState) ? 'Audio playing...' : 'Audio ready · Space to Start Bell')
                    : questionState === 'running'
                    ? 'Space · End Bell'
                    : 'Space · Next Question'}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Start Bell Button */}
                <button
                  onClick={handleStartBell}
                  disabled={questionState !== 'awaiting_start' || ['loading', 'playing', 'paused', 'blocked'].includes(narrationQueueState)}
                  className={`py-3.5 px-5 rounded-2xl font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 transition-all ${
                    (questionState === 'awaiting_start' && !['loading', 'playing', 'paused', 'blocked'].includes(narrationQueueState))
                      ? 'bg-blue-600 hover:bg-blue-500 text-white ring-2 ring-blue-400/40 shadow-blue-600/30 active:scale-98'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  }`}
                >
                  <Play className="w-5 h-5 fill-current" />
                  Start Bell (Space)
                </button>

                {/* End Bell Button */}
                <button
                  onClick={handleEndBell}
                  disabled={questionState !== 'running'}
                  className={`py-3.5 px-5 rounded-2xl font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 transition-all ${
                    questionState === 'running'
                      ? 'bg-purple-600 hover:bg-purple-500 text-white ring-2 ring-purple-400/40 shadow-purple-600/30 active:scale-98 animate-pulse'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  }`}
                >
                  <Square className="w-5 h-5 fill-current" />
                  End Bell (Space)
                </button>

                {/* Record Red / False Start Override Button */}
                <button
                  onClick={() => setShowFalseStartConfirm(true)}
                  disabled={questionState !== 'running'}
                  className={`py-3.5 px-5 rounded-2xl font-extrabold text-sm border transition-all flex items-center justify-center gap-2 ${
                    questionState === 'running'
                      ? 'bg-rose-950/60 hover:bg-rose-900 border-rose-500/50 text-rose-300 hover:text-white'
                      : 'bg-slate-800 border-slate-700/50 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                  Record Red · False Start
                </button>
              </div>
            </div>
          </div>
        )}


      </main>

      {/* Focus Mode Fullscreen View Canvas */}
      {isFocusMode && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col p-2.5 sm:p-4 lg:p-6 overflow-hidden animate-in fade-in duration-200">
          {/* Top Focus Mode Bar */}
          <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-slate-800 gap-3 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="p-1.5 sm:p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2 truncate">
                  <span className="truncate">Focus Mode · Active Measurement Canvas</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] uppercase font-mono shrink-0">
                    Q{currentGlobalOrder}/49
                  </span>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                  Learner: {learner.name} ({learner.code}) • Session {currentSessionNumber} — Q{currentQuestion.questionInSession}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsFocusMode(false)}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-all shadow-md shrink-0"
              title="Exit Focus Mode (ESC)"
            >
              <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-300" />
              <span className="hidden xs:inline">Exit Focus View</span>
              <span className="xs:hidden">Exit</span>
            </button>
          </div>

          {/* Focused Canvas Main Content */}
          <div className="flex-1 min-h-0 overflow-y-auto max-w-4xl w-full mx-auto my-auto flex flex-col py-2 sm:py-4 space-y-3 sm:space-y-5">
            {questionState === 'result_review' && activeReviewAttempt ? (
              <BlueTestResultReview
                attempt={activeReviewAttempt}
                totalQuestions={49}
                onNextQuestion={handleNextQuestion}
                onOpenCorrection={() => setEditingAttempt(activeReviewAttempt)}
                onTryAgain={() => handleTryAgainQuestion(activeReviewAttempt.globalQuestionOrder)}
                onReplayEndBell={audioSettings.enableBells ? playEndBell : undefined}
                isErrorState={hasPersistenceError}
                onRetrySave={() => finalizeQuestion('manual_end')}
                onUpdateAttempt={(updated) => {
                  setActiveReviewAttempt(updated);
                  reloadAttempts();
                }}
              />
            ) : isCompleted ? (
              <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-slate-900 border border-blue-500/40 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xl my-auto">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center mx-auto border border-blue-400/30 shadow-inner">
                  <Award className="w-7 h-7 sm:w-8 sm:h-8" />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">49-Question Blue Test Completed!</h3>
                <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto">
                  All 7 sessions are finalized. You can now exit Focus Mode to analyze %i metrics, review session distributions, or perform corrections.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setIsFocusMode(false)}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all"
                  >
                    Exit Focus View & Review Analysis
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-3 sm:space-y-5 shadow-2xl my-auto overflow-hidden flex flex-col">
                {/* Question Banner */}
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-blue-400 block truncate">
                        Session {currentSessionNumber} — Question {currentQuestion.questionInSession}
                      </span>
                      <button
                        onClick={() => {
                          if (questionState === 'running') return;
                          playChallengeCue(currentGlobalOrder, currentQuestion.questionInSession);
                        }}
                        disabled={questionState === 'running'}
                        className="px-2 py-0.5 text-[10px] sm:text-xs font-bold bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/50 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
                        title={`Replay audio cue for Question ${currentGlobalOrder}`}
                        aria-label={`Replay audio cue for Question ${currentGlobalOrder}`}
                      >
                        <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Cue #{currentQuestion.questionInSession}</span>
                      </button>
                    </div>
                    <h2 className="text-base sm:text-2xl font-black text-white mt-0.5 truncate">
                      {currentQuestion.promptText}
                    </h2>
                  </div>
                  <div className="bg-slate-950 p-2.5 sm:p-3.5 rounded-xl border border-slate-800 text-right shrink-0">
                    <span className="text-[10px] sm:text-xs text-slate-400 font-medium block" title="Threshold Conscious Time">TCT (Threshold Conscious Time)</span>
                    <span className="text-lg sm:text-2xl font-mono font-black text-blue-400">
                      {currentQuestion.maxTimeDisplay}
                    </span>
                  </div>
                </div>

                {/* Large Timer Display */}
                <div className="text-center space-y-1.5 sm:space-y-2 py-2 sm:py-3 bg-slate-950/60 rounded-xl sm:rounded-2xl border border-slate-800/80">
                  <div className="text-3xl sm:text-5xl font-mono font-black text-white tracking-wider">
                    {elapsedSeconds.toFixed(1)}s
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[11px] sm:text-xs text-slate-400 font-semibold">Active Band:</span>
                    <span
                      className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-black text-white shadow-lg"
                      style={{ backgroundColor: activeColorDef.hex }}
                    >
                      {activeColorDef.labelEn}
                    </span>
                  </div>
                </div>

                {/* Face Indicator & Progress Bar */}
                <BlueTestFaceIndicator
                  completionRatio={elapsedSeconds / currentQuestion.maxTimeSecondsRaw}
                  activeColor={activeDerivedColor}
                  maxTimeDisplay={currentQuestion.maxTimeDisplay}
                  isStopped={questionState !== 'running'}
                />

                {/* Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-slate-800">
                  <button
                    onClick={handleStartBell}
                    disabled={questionState !== 'awaiting_start' || ['loading', 'playing', 'paused', 'blocked'].includes(narrationQueueState)}
                    className={`py-3 px-4 sm:py-3.5 sm:px-5 rounded-xl sm:rounded-2xl font-extrabold text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2 transition-all ${
                      (questionState === 'awaiting_start' && !['loading', 'playing', 'paused', 'blocked'].includes(narrationQueueState))
                      ? 'bg-blue-600 hover:bg-blue-500 text-white ring-2 ring-blue-400/40 shadow-blue-600/30'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                    }`}
                  >
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                    Start Bell (Space)
                  </button>

                  <button
                    onClick={handleEndBell}
                    disabled={questionState !== 'running'}
                    className={`py-3 px-4 sm:py-3.5 sm:px-5 rounded-xl sm:rounded-2xl font-extrabold text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2 transition-all ${
                      questionState === 'running'
                        ? 'bg-purple-600 hover:bg-purple-500 text-white ring-2 ring-purple-400/40 shadow-purple-600/30 animate-pulse'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                    }`}
                  >
                    <Square className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                    End Bell (Space)
                  </button>

                  <button
                    onClick={() => setShowFalseStartConfirm(true)}
                    disabled={questionState !== 'running'}
                    className={`py-3 px-4 sm:py-3.5 sm:px-5 rounded-xl sm:rounded-2xl font-extrabold text-xs sm:text-sm border transition-all flex items-center justify-center gap-2 ${
                      questionState === 'running'
                        ? 'bg-rose-950/60 hover:bg-rose-900 border-rose-500/50 text-rose-300 hover:text-white'
                        : 'bg-slate-800 border-slate-700/50 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
                    Record Red · False Start
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Record Red / False Start */}
      {showFalseStartConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Record Red · False Start?</h3>
                <p className="text-xs text-slate-400">Confirm teacher override observation</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              Use this action when Start Bell was pressed but the learner had not actually begun. This finalizes Question {currentQuestion.globalOrder} as <strong className="text-rose-400">Red</strong> with completion mode <code className="text-slate-200">manual_red</code>.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowFalseStartConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFalseStart}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
              >
                Confirm Record Red
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Correction Modal */}
      {editingAttempt && (
        <BlueTestCorrectionModal
          attempt={editingAttempt}
          onClose={() => setEditingAttempt(null)}
          onSaveCorrection={handleSaveCorrection}
          onResetAttempt={() => handleTryAgainQuestion(editingAttempt.globalQuestionOrder)}
        />
      )}
    </div>
  );
};
