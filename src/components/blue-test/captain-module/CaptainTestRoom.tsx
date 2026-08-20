import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AudioSettings,
  BlueAssignment,
  BlueQuestionAttempt,
  BlueQuestionDefinition,
  QuestionState,
  SevenColor,
  NarrationLocationKey,
} from '../../../types/blue-test';
import { Learner } from '../../../types/common';
import { generateDefaultBluePackage, predictChallengeIndexFromElapsed } from '../../../domain/blue-test/timing-engine';
import { deriveCaptainReversedSevenColor, getSevenColorDefinition } from '../../../domain/blue-test/color-engine';
import { BlueTestStorageAdapter } from '../../../persistence/blue-test-storage';
import { AudioStorageAdapter, DEFAULT_NARRATION_SCRIPTS } from '../../../persistence/audio-storage';
import {
  narrationQueue,
  playClockLoop,
  stopClockLoop,
  playStartBell,
  playEndBell,
  stopAllAudio,
  stopNarration,
  pauseNarration,
  resumeNarration,
  restartNarration,
  NarrationQueueItem,
  NarrationStatus,
} from '../../../audio/audio-service';
import { BlueTestRail } from '../BlueTestRail';
import { BlueTestResultReview } from '../BlueTestResultReview';
import { BlueTestCorrectionModal } from '../BlueTestCorrectionModal';
import { BlueTestFaceIndicator } from '../BlueTestFaceIndicator';
import {
  Anchor,
  Play,
  Square,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Clock,
  BarChart3,
  Volume2,
  Keyboard,
  ArrowRight,
  Eye,
  Minimize2,
  Maximize2,
  AlertTriangle,
  Award,
  RotateCcw,
} from 'lucide-react';

export interface CaptainTestRoomProps {
  learner: Learner;
  assignment: BlueAssignment;
  audioSettings: AudioSettings;
  onUpdateAudioSettings?: (settings: AudioSettings) => void;
  onFinishTest: () => void;
  onOpenCaptainAnalysis: () => void;
}

export const CaptainTestRoom: React.FC<CaptainTestRoomProps> = ({
  learner,
  assignment,
  audioSettings,
  onUpdateAudioSettings,
  onFinishTest,
  onOpenCaptainAnalysis,
}) => {
  const pkg = useMemo(() => generateDefaultBluePackage(), []);

  const [currentGlobalOrder, setCurrentGlobalOrder] = useState<number>(assignment.currentGlobalOrder || 1);
  const [questionState, setQuestionState] = useState<QuestionState>('awaiting_start');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const [attempts, setAttempts] = useState<BlueQuestionAttempt[]>(() =>
    BlueTestStorageAdapter.getAttempts(assignment.id)
  );

  // Active result review attempt when in result_review state
  const [activeReviewAttempt, setActiveReviewAttempt] = useState<BlueQuestionAttempt | null>(null);

  // Correction modal state
  const [editingAttempt, setEditingAttempt] = useState<BlueQuestionAttempt | null>(null);

  // Rail collapse state
  const [isRailCollapsed, setIsRailCollapsed] = useState<boolean>(false);

  // Focus Mode state
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Persistence error state
  const [hasPersistenceError, setHasPersistenceError] = useState<boolean>(false);

  const currentQuestion: BlueQuestionDefinition =
    pkg.questions.find((q) => q.globalOrder === currentGlobalOrder) || pkg.questions[0];

  const currentSessionNumber = currentQuestion.sessionNumber;
  const currentSessionIntro = pkg.sessionIntros.find((s) => s.sessionNumber === currentSessionNumber);

  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const handleRecordAttemptRef = useRef<((forceMaxTdt?: boolean) => void) | null>(null);

  // Narration status synchronization with central queue
  const [narrationQueueState, setNarrationQueueState] = useState<string>('idle');
  const [narrationStatus, setNarrationStatus] = useState<NarrationStatus>({
    isPlaying: false,
    isPaused: false,
    hasError: false,
  });

  // Sync attempts when storage changes
  const reloadAttempts = useCallback(() => {
    setAttempts(BlueTestStorageAdapter.getAttempts(assignment.id));
  }, [assignment.id]);

  useEffect(() => {
    reloadAttempts();
  }, [currentGlobalOrder, reloadAttempts]);

  // Subscribe to central narrationQueue updates
  useEffect(() => {
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
    return () => unsubscribe();
  }, []);

  // Restore existing attempt if reloading while in result_review
  useEffect(() => {
    const existing = BlueTestStorageAdapter.getAttemptByOrder(assignment.id, currentGlobalOrder);
    if (existing && existing.finalizedAt) {
      setActiveReviewAttempt(existing);
      setQuestionState('result_review');
    } else {
      setActiveReviewAttempt(null);
      setQuestionState('awaiting_start');
    }
  }, [assignment.id, currentGlobalOrder]);

  // Derived Captain Reversed Color (0s = Purple, TDT = Red)
  const currentCaptainColor: SevenColor = useMemo(
    () => deriveCaptainReversedSevenColor(elapsedSeconds, currentQuestion.maxTimeSecondsRaw),
    [elapsedSeconds, currentQuestion.maxTimeSecondsRaw]
  );

  const colorDef = getSevenColorDefinition(currentCaptainColor);

  // Audio queueing for Captain Test Room (identical source audio to Test Room)
  useEffect(() => {
    if (questionState !== 'awaiting_start') return;

    stopAllAudio();
    const qOrderStr = currentQuestion.globalOrder.toString().padStart(2, '0');
    const items: NarrationQueueItem[] = [];

    // 1. Package Intro (Q1 only)
    if (
      currentQuestion.globalOrder === 1 &&
      (audioSettings.autoplayPackageIntro || audioSettings.autoplayTestIntro) &&
      !BlueTestStorageAdapter.hasPlayedPkgIntro(assignment.id)
    ) {
      BlueTestStorageAdapter.markPkgIntroPlayed(assignment.id);
      const activePkgAsset = AudioStorageAdapter.getActiveVersion('pkg_intro');
      items.push({
        id: `pkg_intro_${assignment.id}`,
        kind: 'test_intro',
        targetKey: 'pkg_intro',
        title: 'Blue Test Intro',
        assignmentId: assignment.id,
        globalOrder: 1,
        text: pkg.packageIntroText || 'Hệ thống đánh giá năng lực tiềm thức Blue Test.',
        audioUrl: activePkgAsset ? activePkgAsset.audioUrl : null,
      });
    }

    // 2. Session Intro (Question 1 of each session)
    if (currentQuestion.questionInSession === 1 && audioSettings.autoplaySessionIntro && currentSessionIntro) {
      const sessKey = `session_${currentSessionNumber}_intro` as NarrationLocationKey;
      const activeSessAsset = AudioStorageAdapter.getActiveVersion(sessKey);
      items.push({
        id: `session_${currentSessionNumber}_intro_${assignment.id}`,
        kind: 'session_intro',
        targetKey: sessKey,
        title: `Session ${currentSessionNumber} Intro`,
        assignmentId: assignment.id,
        sessionNumber: currentSessionNumber,
        sessionQuestionNumber: 1,
        globalOrder: currentQuestion.globalOrder,
        text: activeSessAsset?.scriptText || currentSessionIntro.narrationText || `Bắt đầu phiên số ${currentSessionNumber}.`,
        audioUrl: activeSessAsset ? activeSessAsset.audioUrl : null,
      });
    }

    // 3. Question Cue Audio (blue_test_challenge_01..49)
    if (audioSettings.autoplayQuestionCue || audioSettings.autoplayChallengeAudio || audioSettings.autoplayQuestionNumber !== false) {
      const cueKey = `blue_test_challenge_${qOrderStr}` as NarrationLocationKey;
      const activeCueAsset = AudioStorageAdapter.getActiveVersion(cueKey);
      const config = DEFAULT_NARRATION_SCRIPTS[cueKey];
      items.push({
        id: `blue_test_challenge_${qOrderStr}_${assignment.id}`,
        kind: 'question_number',
        targetKey: cueKey,
        title: `Challenge ${currentQuestion.globalOrder} Audio Cue`,
        assignmentId: assignment.id,
        sessionNumber: currentSessionNumber,
        sessionQuestionNumber: currentQuestion.questionInSession,
        globalOrder: currentQuestion.globalOrder,
        text: config?.spokenScript || `Challenge ${currentQuestion.globalOrder}. ${currentQuestion.promptText}`,
        audioUrl: activeCueAsset ? activeCueAsset.audioUrl : null,
      });
    }

    if (items.length > 0) {
      narrationQueue.clearAndEnqueue(items);
    }
  }, [
    currentGlobalOrder,
    assignment.id,
    audioSettings,
    currentQuestion,
    currentSessionNumber,
    currentSessionIntro,
    pkg,
    questionState,
  ]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, []);

  // Timer loop
  useEffect(() => {
    if (questionState !== 'running') {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    startTimeRef.current = performance.now() - elapsedSeconds * 1000;

    const updateTimer = () => {
      if (!startTimeRef.current) return;
      const now = performance.now();
      const currentElapsed = (now - startTimeRef.current) / 1000;

      if (currentElapsed >= currentQuestion.maxTimeSecondsRaw) {
        setElapsedSeconds(currentQuestion.maxTimeSecondsRaw);
        // Auto-timeout reaches max TDT -> Crew Win (Captain 100% Red) & Show Review Popup
        if (handleRecordAttemptRef.current) {
          handleRecordAttemptRef.current(true);
        }
      } else {
        setElapsedSeconds(currentElapsed);
        animFrameRef.current = requestAnimationFrame(updateTimer);
      }
    };

    animFrameRef.current = requestAnimationFrame(updateTimer);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [questionState, currentQuestion.maxTimeSecondsRaw, elapsedSeconds]);

  // Reset elapsed when switching questions
  useEffect(() => {
    const existing = attempts.find((a) => a.globalQuestionOrder === currentGlobalOrder);
    if (existing) {
      setElapsedSeconds(existing.effectiveElapsedSeconds ?? existing.elapsedSecondsRaw);
    } else {
      setElapsedSeconds(0);
    }
  }, [currentGlobalOrder, attempts]);

  // Start timer handler
  const handleStartTimer = useCallback(() => {
    stopNarration();
    narrationQueue.clearQueue();

    if (audioSettings.enableBells ?? true) {
      playStartBell();
    }
    if (audioSettings.timerSoundEnabled ?? true) {
      playClockLoop(null, audioSettings.timerSoundVolume ?? 0.5);
    }

    if (elapsedSeconds >= currentQuestion.maxTimeSecondsRaw) {
      setElapsedSeconds(0);
    }
    setQuestionState('running');
  }, [elapsedSeconds, currentQuestion.maxTimeSecondsRaw, audioSettings]);

  // Finalize Captain Disruption Attempt & Open Popup Summary
  const handleRecordAttempt = useCallback(
    (forceMaxTdt = false) => {
      stopClockLoop();
      if (audioSettings.enableBells ?? true) {
        playEndBell();
      }

      const nowStr = new Date().toISOString();
      const finalElapsed = forceMaxTdt ? currentQuestion.maxTimeSecondsRaw : elapsedSeconds;

      const mctRounded = Number(finalElapsed.toFixed(2));
      const tdtRounded = Number(currentQuestion.maxTimeSecondsRaw.toFixed(2));
      const isDisrupted = mctRounded < tdtRounded;

      const derivedColor = isDisrupted
        ? deriveCaptainReversedSevenColor(finalElapsed, currentQuestion.maxTimeSecondsRaw)
        : 'red';

      try {
        const { attempt } = BlueTestStorageAdapter.finalizeAttempt({
          assignmentId: assignment.id,
          runId: `captain-run-${assignment.id}`,
          questionId: currentQuestion.id,
          globalQuestionOrder: currentQuestion.globalOrder,
          sessionNumber: currentQuestion.sessionNumber,
          questionInSession: currentQuestion.questionInSession,
          maxTimeSecondsRaw: currentQuestion.maxTimeSecondsRaw,
          startedAt: nowStr,
          endedAt: nowStr,
          elapsedSecondsRaw: finalElapsed,
          completionRatio: Math.min(1, finalElapsed / currentQuestion.maxTimeSecondsRaw),
          derivedColorAtStop: derivedColor,
          effectiveColor: derivedColor,
          completionMode: forceMaxTdt ? 'auto_max' : 'manual_end',
          stoppedAtChallengeIndex: currentQuestion.globalOrder,
          actor: 'Captain',
        });

        reloadAttempts();
        setActiveReviewAttempt(attempt);
        setQuestionState('result_review');
        setHasPersistenceError(false);
      } catch (err) {
        console.error('Error saving captain attempt:', err);
        setHasPersistenceError(true);
        setQuestionState('error');
      }
    },
    [
      elapsedSeconds,
      currentQuestion,
      assignment.id,
      reloadAttempts,
      audioSettings,
    ]
  );

  // Keep ref updated for timer callback
  useEffect(() => {
    handleRecordAttemptRef.current = handleRecordAttempt;
  }, [handleRecordAttempt]);

  // Advance to Next Question from Popup Summary Review
  const handleNextQuestion = useCallback(() => {
    if (currentGlobalOrder < 49) {
      setCurrentGlobalOrder((prev) => prev + 1);
      setQuestionState('awaiting_start');
      setActiveReviewAttempt(null);
    } else {
      onOpenCaptainAnalysis();
    }
  }, [currentGlobalOrder, onOpenCaptainAnalysis]);

  // Re-try / Re-measure current question
  const handleTryAgain = useCallback((globalOrder: number) => {
    setCurrentGlobalOrder(globalOrder);
    setElapsedSeconds(0);
    setQuestionState('awaiting_start');
    setActiveReviewAttempt(null);
  }, []);

  // Global Spacebar listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();

        if (questionState === 'awaiting_start') {
          handleStartTimer();
        } else if (questionState === 'running') {
          handleRecordAttempt(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [questionState, handleStartTimer, handleRecordAttempt]);

  // Manual Replay Audio Cue for Active Question
  const playChallengeCue = useCallback((globalOrder: number, numInSession: number) => {
    stopNarration();
    narrationQueue.clearQueue();

    const padded = globalOrder < 10 ? '0' + globalOrder : globalOrder;
    const locKey = `blue_test_challenge_${padded}` as NarrationLocationKey;
    const config = DEFAULT_NARRATION_SCRIPTS[locKey];
    const activeAsset = AudioStorageAdapter.getActiveVersion(locKey);
    const spokenText = config?.spokenScript || `Challenge ${globalOrder}.`;

    narrationQueue.clearAndEnqueue({
      id: `manual_captain_challenge_cue_${globalOrder}_${assignment.id}`,
      kind: 'question_number',
      targetKey: locKey,
      title: `Challenge ${globalOrder} Cue`,
      assignmentId: assignment.id,
      sessionQuestionNumber: numInSession,
      globalOrder,
      text: spokenText,
      audioUrl: activeAsset ? activeAsset.audioUrl : null,
    });
  }, [assignment.id]);

  // Audio trigger helpers for Rail
  const handlePlayTestIntro = useCallback(() => {
    const activePkgAsset = AudioStorageAdapter.getActiveVersion('pkg_intro');
    narrationQueue.clearAndEnqueue({
      id: `manual_test_intro_${assignment.id}`,
      kind: 'test_intro',
      targetKey: 'pkg_intro',
      title: 'Blue Test Intro',
      assignmentId: assignment.id,
      text: pkg.packageIntroText || 'Hệ thống đánh giá năng lực tiềm thức Blue Test.',
      audioUrl: activePkgAsset ? activePkgAsset.audioUrl : null,
    });
  }, [assignment.id, pkg.packageIntroText]);

  const handlePlaySessionIntro = useCallback(
    (sessionNum: number) => {
      const locKey = `session_${sessionNum}_intro` as NarrationLocationKey;
      const activeAsset = AudioStorageAdapter.getActiveVersion(locKey);
      const text = activeAsset?.scriptText || currentSessionIntro?.narrationText || `Session ${sessionNum} Intro`;
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

  const percentX = Math.min(1, elapsedSeconds / currentQuestion.maxTimeSecondsRaw);
  const isCompleted = attempts.filter((a) => a.finalizedAt).length >= 49;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* Question Tracking Rail (Identical sidebar component as Test Room) */}
      <BlueTestRail
        currentGlobalOrder={currentGlobalOrder}
        attempts={attempts}
        onSelectQuestion={(globalOrder) => {
          setCurrentGlobalOrder(globalOrder);
          const existing = attempts.find((a) => a.globalQuestionOrder === globalOrder);
          if (existing && existing.finalizedAt) {
            setActiveReviewAttempt(existing);
            setQuestionState('result_review');
          } else {
            setActiveReviewAttempt(null);
            setQuestionState('awaiting_start');
          }
        }}
        onOpenCorrection={(attempt) => setEditingAttempt(attempt)}
        isCollapsed={isRailCollapsed}
        onToggleCollapse={() => setIsRailCollapsed(!isRailCollapsed)}
        isTimerRunning={questionState === 'running'}
        learner={learner}
        currentQuestionInSession={currentQuestion.questionInSession}
        currentSessionIntro={currentSessionIntro}
        narrationStatus={narrationStatus}
        audioSettings={audioSettings}
        onUpdateAudioSettings={onUpdateAudioSettings}
        onPauseNarration={pauseNarration}
        onResumeNarration={resumeNarration}
        onRestartNarration={restartNarration}
        onStopNarration={stopNarration}
        onPlayTestIntro={handlePlayTestIntro}
        onPlaySessionIntro={handlePlaySessionIntro}
        onEndTest={onOpenCaptainAnalysis}
      />

      {/* Main Captain Test Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto p-4 lg:p-6 space-y-6">
        {/* Top Bar Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Anchor className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">Captain Test Room</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Mode ⚓ Captain
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Independent Captain Time ($DT$) Measurement • Reversed Color Scale (Purple → Red)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={() => setIsFocusMode(!isFocusMode)}
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all border border-slate-700"
              title={isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode'}
            >
              {isFocusMode ? <Minimize2 className="w-4 h-4 text-cyan-400" /> : <Maximize2 className="w-4 h-4 text-cyan-400" />}
            </button>

            <button
              onClick={onOpenCaptainAnalysis}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold text-xs transition-all border border-slate-700 shadow-md"
            >
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span>Captain Analysis (%i)</span>
            </button>
          </div>
        </div>

        {/* Dynamic State Layout: Result Review Popup vs Active Measurement Room */}
        {questionState === 'result_review' && activeReviewAttempt ? (
          <div className="my-auto py-4">
            <BlueTestResultReview
              attempt={activeReviewAttempt}
              totalQuestions={49}
              isCaptainMode={true}
              onNextQuestion={handleNextQuestion}
              onOpenCorrection={() => setEditingAttempt(activeReviewAttempt)}
              onTryAgain={() => handleTryAgain(activeReviewAttempt.globalQuestionOrder)}
              onReplayEndBell={audioSettings.enableBells ? playEndBell : undefined}
              isErrorState={hasPersistenceError}
              onRetrySave={() => handleRecordAttempt(false)}
              onUpdateAttempt={(updated) => {
                setActiveReviewAttempt(updated);
                reloadAttempts();
              }}
            />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full my-auto space-y-6">
            {/* Main Timer & Disruption Card */}
            <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 text-center relative overflow-hidden shadow-2xl">
              {/* Header Navigation & Status Indicator */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-4">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${questionState === 'running' ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'}`} />
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                    {questionState === 'running' ? 'Measuring Captain Time...' : 'Ready for Measurement'}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    disabled={currentGlobalOrder <= 1 || questionState === 'running'}
                    onClick={() => setCurrentGlobalOrder((prev) => Math.max(1, prev - 1))}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition-all border border-slate-700"
                    title="Previous Question"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="text-xs font-mono font-black text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-3 py-1 rounded-full">
                    Q{currentGlobalOrder.toString().padStart(2, '0')} (Session {currentQuestion.sessionNumber}) • TDT = {currentQuestion.maxTimeSecondsRaw.toFixed(1)}s
                  </span>

                  <button
                    disabled={currentGlobalOrder >= 49 || questionState === 'running'}
                    onClick={() => setCurrentGlobalOrder((prev) => Math.min(49, prev + 1))}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition-all border border-slate-700"
                    title="Next Question"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Audio Cue Replay Icon Button */}
                  <button
                    onClick={() => playChallengeCue(currentGlobalOrder, currentQuestion.questionInSession)}
                    disabled={questionState === 'running'}
                    className="px-2.5 py-1 rounded-xl bg-indigo-950 hover:bg-indigo-900 active:scale-95 text-indigo-300 border border-indigo-700/50 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-40"
                    title={`Replay audio cue for Question ${currentGlobalOrder}`}
                    aria-label={`Replay audio cue for Question ${currentGlobalOrder}`}
                  >
                    <Volume2 className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                    <span>Cue #{currentQuestion.questionInSession}</span>
                  </button>
                </div>

                {activeReviewAttempt && (
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1 rounded-full">
                    Result Recorded
                  </span>
                )}
              </div>

                {/* Clock Display */}
                <div className="py-2 space-y-3">
                  <div className="text-6xl sm:text-7xl font-black font-mono tracking-tight text-white drop-shadow-md">
                    {elapsedSeconds.toFixed(2)}s
                    <span className="text-2xl font-bold text-slate-500 ml-2">/ {currentQuestion.maxTimeSecondsRaw.toFixed(1)}s</span>
                  </div>

                  {/* Reversed Color Badge */}
                  <div className="flex items-center justify-center gap-3">
                    <span
                      className="px-4 py-1.5 rounded-2xl text-xs font-black uppercase tracking-wider border shadow-lg transition-all"
                      style={{
                        backgroundColor: `${colorDef.hex}25`,
                        borderColor: `${colorDef.hex}60`,
                        color: colorDef.hex,
                      }}
                    >
                      Captain Band: {colorDef.labelEn}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-400">
                      %x = {(percentX * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Progress Bar (Reversed Color Scale: Purple -> Red) */}
                <div className="space-y-1.5">
                  <div className="h-4 w-full bg-slate-950 rounded-full p-0.5 border border-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-75"
                      style={{
                        width: `${Math.min(100, percentX * 100)}%`,
                        backgroundColor: colorDef.hex,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono font-bold text-slate-500">
                    <span>0.0s (Purple)</span>
                    <span>TDT = {currentQuestion.maxTimeSecondsRaw.toFixed(1)}s (Red)</span>
                  </div>
                </div>

                {/* Face Indicator with Captain Reversed Color */}
                <BlueTestFaceIndicator
                  completionRatio={percentX}
                  activeColor={currentCaptainColor}
                  maxTimeDisplay={currentQuestion.maxTimeDisplay}
                  isStopped={questionState !== 'running'}
                  isReversedScale={true}
                />

                {/* Action Controls */}
                <div className="pt-2 flex flex-col items-center gap-3">
                  {questionState !== 'running' ? (
                    <button
                      onClick={handleStartTimer}
                      className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-sm transition-all shadow-xl shadow-cyan-950/50 flex items-center justify-center gap-3 active:scale-95"
                    >
                      <Play className="w-5 h-5 fill-white" />
                      <span>Start Measurement Q{currentGlobalOrder} [Spacebar]</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRecordAttempt(false)}
                      className="w-full sm:w-auto px-10 py-5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-black text-base transition-all shadow-2xl shadow-purple-950/80 flex items-center justify-center gap-3 animate-pulse active:scale-95 border border-purple-400/40"
                    >
                      <ShieldAlert className="w-6 h-6" />
                      <span>CAPTAIN STOP [Spacebar]</span>
                    </button>
                  )}

                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                    <Keyboard className="w-4 h-4 text-cyan-400" />
                    <span>Press [Spacebar] to Start / Stop & Show Summary</span>
                  </div>
                </div>
              </div>
          </div>
        )}
      </main>

      {/* Correction Modal */}
      {editingAttempt && (
        <BlueTestCorrectionModal
          attempt={editingAttempt}
          onClose={() => setEditingAttempt(null)}
          onSaveCorrection={(updated) => {
            setEditingAttempt(null);
            reloadAttempts();
            if (activeReviewAttempt?.id === updated.id) {
              setActiveReviewAttempt(updated);
            }
          }}
          onResetAttempt={() => handleTryAgain(editingAttempt.globalQuestionOrder)}
        />
      )}
    </div>
  );
};
