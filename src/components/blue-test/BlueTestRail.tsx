import React, { useState, useEffect } from 'react';
import { BlueQuestionAttempt, SevenColor, NarrationLocationKey, BlueSessionIntro, AudioSettings } from '../../types/blue-test';
import { Learner } from '../../types/common';
import { getSevenColorDefinition } from '../../domain/blue-test/color-engine';
import { generateBlueTestQuestions } from '../../domain/blue-test/timing-engine';
import { playNarrationAssetOrSpeech, stopNarration, narrationQueue, NarrationStatus, setPlaybackRate, getPlaybackRate, playClockLoop, stopClockLoop } from '../../audio/audio-service';
import { AudioStorageAdapter, DEFAULT_NARRATION_SCRIPTS } from '../../persistence/audio-storage';
import { calculatePercentIMetrics } from '../../domain/blue-test/metrics-engine';
import { LearnerAvatar } from '../common/LearnerAvatar';
import {
  Check,
  Clock,
  Edit3,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  Sparkles,
  Lock,
  Settings,
  HelpCircle,
  Layers,
  Zap,
  FastForward,
  RefreshCw,
} from 'lucide-react';

interface BlueTestRailProps {
  currentGlobalOrder: number;
  attempts: BlueQuestionAttempt[];
  onSelectQuestion: (globalOrder: number) => void;
  onOpenCorrection: (attempt: BlueQuestionAttempt) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isTimerRunning?: boolean;
  packageIntroText?: string;
  packageEndText?: string;
  // Learner profile props
  learner?: Learner;
  currentQuestionInSession?: number;
  currentSessionIntro?: BlueSessionIntro | null;
  // Narration control props
  narrationStatus?: NarrationStatus;
  audioSettings?: AudioSettings;
  onUpdateAudioSettings?: (settings: AudioSettings) => void;
  onPauseNarration?: () => void;
  onResumeNarration?: () => void;
  onRestartNarration?: () => void;
  onStopNarration?: () => void;
  onPlayTestIntro?: () => void;
  onPlaySessionIntro?: (sessionNum: number) => void;
  onEndTest?: () => void;
}

export const BlueTestRail: React.FC<BlueTestRailProps> = ({
  currentGlobalOrder,
  attempts,
  onSelectQuestion,
  onOpenCorrection,
  isCollapsed = false,
  onToggleCollapse,
  isTimerRunning = false,
  packageIntroText = 'Welcome to the 49-Question TCT (Threshold Conscious Time) Assessment.',
  packageEndText = 'Congratulations! You have completed all 49 questions in the Blue Test.',
  learner,
  currentQuestionInSession,
  currentSessionIntro,
  narrationStatus,
  audioSettings,
  onUpdateAudioSettings,
  onPauseNarration,
  onResumeNarration,
  onRestartNarration,
  onStopNarration,
  onPlayTestIntro,
  onPlaySessionIntro,
  onEndTest,
}) => {
  const [isSetupExpanded, setIsSetupExpanded] = useState<boolean>(false);
  const [activeSpeed, setActiveSpeed] = useState<number>(() => getPlaybackRate());

  const handleSpeedChange = (speed: number) => {
    setActiveSpeed(speed);
    setPlaybackRate(speed);
  };
  const allQuestions = generateBlueTestQuestions();
  const questionMap = new Map();
  allQuestions.forEach((q) => questionMap.set(q.globalOrder, q));

  // Map attempts by global order
  const attemptMap = new Map<number, BlueQuestionAttempt>();
  attempts.forEach((a) => attemptMap.set(a.globalQuestionOrder, a));

  const activeSessionNumber = Math.ceil(currentGlobalOrder / 7);

  // Accordion state: track manually expanded sessions
  const [expandedSessions, setExpandedSessions] = useState<Record<number, boolean>>(() => ({
    [activeSessionNumber]: true,
  }));

  // Auto-expand active session when currentGlobalOrder changes
  useEffect(() => {
    setExpandedSessions((prev) => ({
      ...prev,
      [activeSessionNumber]: true,
    }));
  }, [activeSessionNumber]);

  const toggleSessionExpand = (sNum: number) => {
    // Prevent collapsing active session while timer is running
    if (sNum === activeSessionNumber && isTimerRunning) return;

    setExpandedSessions((prev) => ({
      ...prev,
      [sNum]: !prev[sNum],
    }));
  };

  // Rail Footer Audio States synchronized with central narrationQueue
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  const [audioLabel, setAudioLabel] = useState<string>('');
  const [playingSessionNum, setPlayingSessionNum] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = narrationQueue.subscribe((state, currentItem) => {
      setIsAudioPlaying(state === 'playing');
      if (state === 'playing' && currentItem) {
        setAudioLabel(`Playing ${currentItem.title}...`);
        setPlayingSessionNum(currentItem.sessionNumber ?? null);
      } else if (state !== 'playing' && state !== 'loading') {
        setAudioLabel('');
        setPlayingSessionNum(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Toggle editor visibility map for session intros
  const [showEditorMap, setShowEditorMap] = useState<Record<number, boolean>>({});

  // Editable session intro texts (1..7) synchronized with active AudioStorageAdapter versions
  const [sessionIntroTexts, setSessionIntroTexts] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (let s = 1; s <= 7; s++) {
      const locKey = `session_${s}_intro` as NarrationLocationKey;
      const activeVer = AudioStorageAdapter.getActiveVersion(locKey);
      const defaultConfig = DEFAULT_NARRATION_SCRIPTS[locKey];
      initial[s] = activeVer?.scriptText || defaultConfig?.spokenScript || defaultConfig?.defaultScript || `Session ${s} Intro`;
    }
    return initial;
  });

  const [, setAudioStorageUpdateCount] = useState(0);
  useEffect(() => {
    const syncActiveScripts = () => {
      setSessionIntroTexts((prev) => {
        const next = { ...prev };
        let changed = false;
        for (let s = 1; s <= 7; s++) {
          const locKey = `session_${s}_intro` as NarrationLocationKey;
          const activeVer = AudioStorageAdapter.getActiveVersion(locKey);
          const activeScript = activeVer?.scriptText || DEFAULT_NARRATION_SCRIPTS[locKey]?.spokenScript || DEFAULT_NARRATION_SCRIPTS[locKey]?.defaultScript;
          if (activeScript && next[s] !== activeScript) {
            next[s] = activeScript;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    syncActiveScripts();

    return AudioStorageAdapter.subscribe(() => {
      setAudioStorageUpdateCount((c) => c + 1);
      syncActiveScripts();
    });
  }, []);

  const handlePlaySessionIntro = (sNum: number) => {
    if (isTimerRunning) return;
    if (playingSessionNum === sNum && isAudioPlaying) {
      narrationQueue.clearQueue();
      return;
    }

    const locKey = `session_${sNum}_intro` as NarrationLocationKey;
    const activeAsset = AudioStorageAdapter.getActiveVersion(locKey);
    const textToPlay = sessionIntroTexts[sNum] || activeAsset?.scriptText || DEFAULT_NARRATION_SCRIPTS[locKey]?.spokenScript || DEFAULT_NARRATION_SCRIPTS[locKey]?.defaultScript || '';

    narrationQueue.clearAndEnqueue({
      id: `rail_session_intro_${sNum}`,
      kind: 'session_intro',
      targetKey: locKey,
      title: `Session ${sNum} Intro`,
      assignmentId: 'rail',
      sessionNumber: sNum,
      text: textToPlay,
      audioUrl: activeAsset ? activeAsset.audioUrl : null,
    });
  };

  const handlePlayPackageIntro = () => {
    if (isTimerRunning) return;
    if (isAudioPlaying && audioLabel.includes('Test Intro')) {
      narrationQueue.clearQueue();
      return;
    }
    const activeAsset = AudioStorageAdapter.getActiveVersion('pkg_intro');
    narrationQueue.clearAndEnqueue({
      id: 'rail_pkg_intro',
      kind: 'test_intro',
      targetKey: 'pkg_intro',
      title: 'Blue Test Intro',
      assignmentId: 'rail',
      text: packageIntroText,
      audioUrl: activeAsset ? activeAsset.audioUrl : null,
    });
  };

  const handlePlayPackageEnd = () => {
    if (isTimerRunning) return;
    if (isAudioPlaying && audioLabel.includes('Test End')) {
      narrationQueue.clearQueue();
      return;
    }
    const activeAsset = AudioStorageAdapter.getActiveVersion('pkg_end');
    narrationQueue.clearAndEnqueue({
      id: 'rail_pkg_end',
      kind: 'test_end',
      targetKey: 'pkg_end',
      title: 'Blue Test End Preview',
      assignmentId: 'rail',
      text: packageEndText,
      audioUrl: activeAsset ? activeAsset.audioUrl : null,
    });
  };

  const handlePlayQuestionCue = () => {
    if (isTimerRunning) return;
    const qInS = currentQuestionInSession || ((currentGlobalOrder - 1) % 7 + 1);
    if (isAudioPlaying && audioLabel.includes(`Q${qInS}`)) {
      narrationQueue.clearQueue();
      return;
    }
    const locKey = `blue_test_question_number_${qInS}` as NarrationLocationKey;
    const activeAsset = AudioStorageAdapter.getActiveVersion(locKey);
    const script = DEFAULT_NARRATION_SCRIPTS[locKey]?.defaultScript || `Question ${qInS}`;

    const challengeKey = `blue_test_challenge_${String(currentGlobalOrder).padStart(2, '0')}` as NarrationLocationKey;
    const challengeAsset = AudioStorageAdapter.getActiveVersion(challengeKey);

    narrationQueue.clearAndEnqueue({
      id: `rail_q_cue_${currentGlobalOrder}`,
      kind: 'question_number',
      targetKey: challengeAsset ? challengeKey : locKey,
      title: `Q${qInS} (Q${currentGlobalOrder}) Audio`,
      assignmentId: 'rail',
      text: script,
      audioUrl: challengeAsset ? challengeAsset.audioUrl : (activeAsset ? activeAsset.audioUrl : null),
    });
  };

  const finalizedAttempts = attempts.filter((a) => a.finalizedAt);
  const metrics = calculatePercentIMetrics(attempts);
  const totalEffectiveElapsed = finalizedAttempts.reduce((sum, a) => sum + (a.effectiveElapsedSeconds || 0), 0);
  const actValue = totalEffectiveElapsed / 49;
  const maxMCT = finalizedAttempts.reduce((max, a) => Math.max(max, a.effectiveElapsedSeconds || 0), 0);

  return (
    <aside
      className={`bg-slate-900 border-r border-slate-800 text-slate-200 flex flex-col transition-all duration-200 h-full max-h-screen overflow-hidden ${
        isCollapsed ? 'w-16' : 'w-72 sm:w-80'
      }`}
    >
      {/* 1. Learner Profile Header Card (Top-most element) */}
      {learner && (
        <div className="p-3.5 border-b border-slate-800 bg-slate-950/80 shrink-0">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2" title={`${learner.name} (${learner.code})`}>
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold w-full text-center"
                  title="Expand Rail"
                >
                  →
                </button>
              )}
              <LearnerAvatar learner={learner} size="sm" />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <LearnerAvatar learner={learner} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-xs font-bold text-white truncate">{learner.name}</h4>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full shrink-0">
                      {learner.code}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1.5 whitespace-nowrap">
                    <span className="px-1 py-[1px] text-[9px] font-bold bg-blue-900/40 text-blue-300 border border-blue-500/30 rounded" title="Rules Awareness Coefficient">
                      %i: {metrics.provisionalPercentI !== null ? `${metrics.provisionalPercentI.toFixed(1)}%` : '—'}
                    </span>
                    <span className="px-1 py-[1px] text-[9px] font-bold bg-indigo-900/40 text-indigo-300 border border-indigo-500/30 rounded" title="Average Conscious Time">
                      ACT: {actValue > 0 ? `${actValue.toFixed(2)}s` : '—'}
                    </span>
                    <span className="px-1 py-[1px] text-[9px] font-bold bg-purple-900/40 text-purple-300 border border-purple-500/30 rounded" title="Max Conscious Time">
                      Max MCT: {maxMCT > 0 ? `${maxMCT.toFixed(2)}s` : '—'}
                    </span>
                  </div>
                </div>
              </div>
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs font-semibold shrink-0"
                  title="Collapse Rail"
                >
                  ←
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. Question Tracking Rail Header (Positioned below Learner card) */}
      <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40 shrink-0">
        {!isCollapsed ? (
          <div>
            <h3 className="font-bold text-xs text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Question Tracking Rail
            </h3>
            <p className="text-[10px] text-slate-400">49 Questions • 7 Session Accordion</p>
          </div>
        ) : (
          <div className="w-full text-center">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Rail</span>
          </div>
        )}
      </div>

      {/* Sessions Accordion List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs scrollbar-thin scrollbar-thumb-slate-700">
        {Array.from({ length: 7 }, (_, sIdx) => {
          const sessionNum = sIdx + 1;
          const startQ = (sessionNum - 1) * 7 + 1;
          const endQ = sessionNum * 7;

          const isCurrentSession = sessionNum === activeSessionNumber;
          const isExpanded = !!expandedSessions[sessionNum];

          // Compute session completion counts & dots
          let completedCount = 0;
          const sessionDots: SevenColor[] = [];
          for (let q = startQ; q <= endQ; q++) {
            const att = attemptMap.get(q);
            if (att?.finalizedAt) {
              completedCount++;
              sessionDots.push(att.effectiveColor);
            }
          }

          if (isCollapsed) {
            return (
              <div key={`coll-sess-${sessionNum}`} className="space-y-1 text-center">
                <span className="text-[10px] font-bold text-slate-500 block">S{sessionNum}</span>
                {Array.from({ length: 7 }, (_, qIdx) => {
                  const globalOrder = startQ + qIdx;
                  const attempt = attemptMap.get(globalOrder);
                  const isCurrent = globalOrder === currentGlobalOrder;
                  const isFinalized = !!attempt?.finalizedAt;
                  const colorDef = attempt ? getSevenColorDefinition(attempt.effectiveColor) : null;

                  return (
                    <button
                      key={globalOrder}
                      onClick={() => onSelectQuestion(globalOrder)}
                      className={`w-10 h-10 rounded-lg font-bold flex flex-col items-center justify-center transition-all mx-auto ${
                        isCurrent
                          ? 'ring-2 ring-blue-400 bg-blue-900/40 text-blue-200'
                          : isFinalized
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-950/60 text-slate-400 hover:bg-slate-800'
                      }`}
                      title={`Q${globalOrder}: ${isFinalized ? colorDef?.labelEn : 'Pending'}`}
                    >
                      <span className="text-[11px]">{globalOrder}</span>
                      {isFinalized && (
                        <span
                          className="w-2 h-2 rounded-full mt-0.5"
                          style={{ backgroundColor: colorDef?.hex }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          }

          return (
            <div
              key={`session-accordion-${sessionNum}`}
              className={`border rounded-2xl overflow-hidden transition-all ${
                isCurrentSession
                  ? 'border-blue-500/50 bg-slate-900/90'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
            >
              {/* Session Accordion Header */}
              <button
                onClick={() => toggleSessionExpand(sessionNum)}
                className={`w-full p-3 flex items-center justify-between text-left transition-all ${
                  isCurrentSession
                    ? 'bg-blue-950/40 text-white font-bold'
                    : 'text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="font-extrabold text-xs">Session {sessionNum}</span>
                  {isCurrentSession && (
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[9px] font-black rounded-full border border-blue-500/30">
                      ACTIVE
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Summary Dots for Completed Session */}
                  {!isExpanded && sessionDots.length > 0 && (
                    <div className="flex items-center -space-x-1">
                      {sessionDots.map((c, i) => (
                        <span
                          key={i}
                          className="w-2.5 h-2.5 rounded-full border border-slate-900 shadow-2xs"
                          style={{ backgroundColor: getSevenColorDefinition(c).hex }}
                        />
                      ))}
                    </div>
                  )}

                  <span className="text-[10px] text-slate-400 font-mono">
                    {completedCount}/7
                  </span>
                </div>
              </button>

              {/* Questions List Inside Expanded Session */}
              {isExpanded && (
                <div className="p-2 space-y-2 border-t border-slate-800/60 bg-slate-950/50">
                  {/* Session Intro Manual Audio & Paste/Edit Box */}
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-blue-500/30 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <Volume2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="text-[11px] font-black text-blue-300 uppercase tracking-wider">
                          Session {sessionNum} Intro
                        </span>
                        {AudioStorageAdapter.getActiveVersion(`session_${sessionNum}_intro` as NarrationLocationKey) && (
                          <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[8px] font-mono font-bold rounded-full">
                            Synced
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const locKey = `session_${sessionNum}_intro` as NarrationLocationKey;
                            const activeVer = AudioStorageAdapter.getActiveVersion(locKey);
                            const script = activeVer?.scriptText || DEFAULT_NARRATION_SCRIPTS[locKey]?.spokenScript || DEFAULT_NARRATION_SCRIPTS[locKey]?.defaultScript;
                            if (script) {
                              setSessionIntroTexts((prev) => ({ ...prev, [sessionNum]: script }));
                            }
                          }}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-bold flex items-center gap-1 transition-all"
                          title="Re-sync script from Audio Management function"
                        >
                          <RefreshCw className="w-3 h-3 text-blue-400" />
                          <span>Sync</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlaySessionIntro(sessionNum);
                          }}
                          disabled={isTimerRunning}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 ${
                            playingSessionNum === sessionNum
                              ? 'bg-blue-500 text-white animate-pulse shadow-md ring-2 ring-blue-300/50'
                              : isTimerRunning
                              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                          }`}
                          title={`Manually play Session ${sessionNum} intro audio`}
                        >
                          {playingSessionNum === sessionNum ? (
                            <VolumeX className="w-3.5 h-3.5" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                          <span>{playingSessionNum === sessionNum ? 'Stop' : 'Play Intro'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {showEditorMap[sessionNum] ? (
                        <div className="space-y-1.5 pt-1">
                          <textarea
                            rows={2}
                            value={sessionIntroTexts[sessionNum] || ''}
                            onChange={(e) => {
                              const newText = e.target.value;
                              setSessionIntroTexts((prev) => ({ ...prev, [sessionNum]: newText }));
                            }}
                            placeholder={`Paste or edit Session ${sessionNum} intro text...`}
                            className="w-full text-[11px] bg-slate-950/90 border border-blue-500/80 focus:border-blue-400 rounded-lg p-2 text-slate-100 placeholder-slate-600 focus:outline-none transition-colors resize-y font-sans leading-snug shadow-inner"
                          />
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowEditorMap((prev) => ({ ...prev, [sessionNum]: false }));
                              }}
                              className="text-[10px] text-blue-300 hover:text-white font-bold px-2 py-0.5 rounded bg-blue-900/60 border border-blue-700/50 transition-colors"
                            >
                              Close Editor
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowEditorMap((prev) => ({ ...prev, [sessionNum]: true }));
                          }}
                          className="px-2.5 py-1.5 bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 rounded-lg text-[10px] text-slate-300 italic cursor-pointer transition-all flex items-center justify-between group shadow-xs mt-1"
                          title="Click to view or edit session intro script"
                        >
                          <span className="line-clamp-1 opacity-90 pr-2">
                            "{sessionIntroTexts[sessionNum] || `Session ${sessionNum} Intro Script`}"
                          </span>
                          <Edit3 className="w-3 h-3 text-slate-500 group-hover:text-blue-400 shrink-0 transition-colors" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 mt-3">
                    {Array.from({ length: 7 }, (_, qIdx) => {
                      const globalOrder = startQ + qIdx;
                      const attempt = attemptMap.get(globalOrder);
                      const isCurrent = globalOrder === currentGlobalOrder;
                      const isFinalized = !!attempt?.finalizedAt;
                      const isCorrected = attempt?.completionMode === 'correction';
                      const colorDef = attempt ? getSevenColorDefinition(attempt.effectiveColor) : null;
                      
                      return (
                        <button
                          key={globalOrder}
                          onClick={() => {
                            if (isFinalized && attempt) {
                              onOpenCorrection(attempt);
                            } else {
                              onSelectQuestion(globalOrder);
                            }
                          }}
                          className={`relative aspect-square rounded-[3px] flex flex-col items-center justify-center font-medium text-[9px] transition-colors ${
                            isCurrent
                              ? 'ring-1 ring-blue-500 bg-blue-900/40 text-blue-200 z-10'
                              : isFinalized && colorDef
                              ? 'text-white/90 hover:opacity-80'
                              : 'bg-slate-900/40 text-slate-600 hover:bg-slate-800'
                          }`}
                          style={isFinalized && colorDef ? { backgroundColor: colorDef.hex } : {}}
                          title={isFinalized ? `Q${globalOrder} - ${colorDef?.labelEn}: ${attempt.elapsedSecondsRaw.toFixed(2)}s (Click to edit)` : `Q${globalOrder} - Pending`}
                        >
                          <span className="z-10 opacity-70 group-hover:opacity-100">{globalOrder}</span>
                          {isCorrected && (
                            <span className="absolute top-0.5 right-0.5 w-1 h-1 bg-white/70 rounded-full" title="Corrected" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rail Footer Narration Sound Control Bar (Fixed/Sticky at bottom) */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/95 space-y-2 text-xs shrink-0 mt-auto sticky bottom-0 z-20 shadow-xl">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2" title="Narration Sound Control">
            <button
              onClick={() => {
                if (narrationStatus?.isPlaying && onPauseNarration) {
                  onPauseNarration();
                } else if (narrationStatus?.isPaused && onResumeNarration) {
                  onResumeNarration();
                } else if (onPlaySessionIntro) {
                  onPlaySessionIntro(activeSessionNumber);
                }
              }}
              className={`p-2 rounded-xl border transition-all ${
                narrationStatus?.isPlaying
                  ? 'bg-blue-600 text-white border-blue-400 animate-pulse'
                  : narrationStatus?.isPaused
                  ? 'bg-amber-600 text-white border-amber-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title={
                narrationStatus?.isPlaying
                  ? 'Pause Audio'
                  : narrationStatus?.isPaused
                  ? 'Resume Audio'
                  : `Play Session ${activeSessionNumber} Intro`
              }
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (audioSettings && onUpdateAudioSettings) {
                  onUpdateAudioSettings({
                    ...audioSettings,
                    timerSoundEnabled: !audioSettings.timerSoundEnabled,
                  });
                }
              }}
              className={`p-2 rounded-xl border transition-all ${
                audioSettings?.timerSoundEnabled
                  ? 'bg-purple-600/30 text-purple-300 border-purple-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-500 border-slate-700'
              }`}
              title={`Clock Sound: ${audioSettings?.timerSoundEnabled ? 'ON' : 'OFF'} (Click to toggle)`}
            >
              <Clock className="w-4 h-4" />
            </button>

            <span className="text-[9px] font-bold text-slate-400">Audio</span>

            <button
              onClick={() => {
                const rates = [0.75, 1.0, 1.25, 1.5, 2.0];
                const idx = rates.indexOf(activeSpeed);
                const nextRate = rates[(idx + 1) % rates.length];
                handleSpeedChange(nextRate);
              }}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 text-[9px] font-black"
              title={`Audio Speed: ${activeSpeed}x (Click to cycle)`}
            >
              {activeSpeed}x
            </button>

            {onEndTest && (
              <button
                onClick={onEndTest}
                className="p-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white border border-rose-500/40"
                title="End Test (Kết thúc Bài Test)"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 ${
                      narrationStatus?.isPlaying
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 animate-pulse'
                        : narrationStatus?.isPaused
                        ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                        Narration Sound Control
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {narrationStatus?.title
                        ? `${narrationStatus.isPlaying ? '🔊 Playing' : narrationStatus.isPaused ? '⏸️ Paused' : 'Ready'}: ${narrationStatus.title}`
                        : (audioLabel || 'Audio Control Unit')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {audioSettings && onUpdateAudioSettings && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateAudioSettings({
                          ...audioSettings,
                          timerSoundEnabled: !audioSettings.timerSoundEnabled,
                        })
                      }
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition-all ${
                        audioSettings.timerSoundEnabled
                          ? 'bg-purple-600 text-white border-purple-400 shadow-xs'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                      }`}
                      title={`Clock Sound Loop: ${audioSettings.timerSoundEnabled ? 'ON (1 Sound)' : 'OFF'}`}
                    >
                      <Clock className="w-3 h-3 text-purple-300" />
                      <span>Clock: {audioSettings.timerSoundEnabled ? 'ON' : 'OFF'}</span>
                    </button>
                  )}
                  {audioSettings && (
                    <button
                      onClick={() => setIsSetupExpanded(!isSetupExpanded)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center shrink-0 border border-slate-700"
                      title="Toggle Setup"
                    >
                      {isSetupExpanded ? <ChevronUp className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Autoplay Toggles Row with Icons */}
              {audioSettings && onUpdateAudioSettings && (
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  {/* Auto Test Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAudioSettings({
                        ...audioSettings,
                        autoplayTestIntro: !audioSettings.autoplayTestIntro,
                        autoplayPackageIntro: !audioSettings.autoplayTestIntro,
                      })
                    }
                    className={`px-1.5 py-1 rounded-md text-[9px] font-bold flex items-center gap-1 border transition-all ${
                      audioSettings.autoplayTestIntro
                        ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 shadow-xs'
                        : 'bg-slate-800/80 text-slate-500 border-slate-700/60 hover:text-slate-300'
                    }`}
                    title="Toggle Auto Play Test Intro"
                  >
                    <Play className={`w-2.5 h-2.5 ${audioSettings.autoplayTestIntro ? 'text-blue-400 fill-blue-400/30' : 'text-slate-500'}`} />
                    <span>Auto Test</span>
                    {audioSettings.autoplayTestIntro && <Check className="w-2.5 h-2.5 text-blue-400 stroke-[3]" />}
                  </button>

                  {/* Auto Session Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAudioSettings({
                        ...audioSettings,
                        autoplaySessionIntro: !audioSettings.autoplaySessionIntro,
                      })
                    }
                    className={`px-1.5 py-1 rounded-md text-[9px] font-bold flex items-center gap-1 border transition-all ${
                      audioSettings.autoplaySessionIntro
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                        : 'bg-slate-800/80 text-slate-500 border-slate-700/60 hover:text-slate-300'
                    }`}
                    title="Toggle Auto Play Session Intro"
                  >
                    <Layers className={`w-2.5 h-2.5 ${audioSettings.autoplaySessionIntro ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>Auto Session</span>
                    {audioSettings.autoplaySessionIntro && <Check className="w-2.5 h-2.5 text-emerald-400 stroke-[3]" />}
                  </button>

                  {/* Auto Question Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAudioSettings({
                        ...audioSettings,
                        autoplayChallengeAudio: !audioSettings.autoplayChallengeAudio,
                        autoplayQuestionCue: !audioSettings.autoplayChallengeAudio,
                        autoplayQuestionNumber: !audioSettings.autoplayChallengeAudio,
                      })
                    }
                    className={`px-1.5 py-1 rounded-md text-[9px] font-bold flex items-center gap-1 border transition-all ${
                      audioSettings.autoplayChallengeAudio
                        ? 'bg-amber-600/20 text-amber-300 border-amber-500/40 shadow-xs'
                        : 'bg-slate-800/80 text-slate-500 border-slate-700/60 hover:text-slate-300'
                    }`}
                    title="Toggle Auto Play Question / Challenge Audio"
                  >
                    <HelpCircle className={`w-2.5 h-2.5 ${audioSettings.autoplayChallengeAudio ? 'text-amber-400' : 'text-slate-500'}`} />
                    <span>Auto Question</span>
                    {audioSettings.autoplayChallengeAudio && <Check className="w-2.5 h-2.5 text-amber-400 stroke-[3]" />}
                  </button>

                  {/* Clock Sound Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAudioSettings({
                        ...audioSettings,
                        timerSoundEnabled: !audioSettings.timerSoundEnabled,
                      })
                    }
                    className={`px-1.5 py-1 rounded-md text-[9px] font-bold flex items-center gap-1 border transition-all ${
                      audioSettings.timerSoundEnabled
                        ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 shadow-xs'
                        : 'bg-slate-800/80 text-slate-500 border-slate-700/60 hover:text-slate-300'
                    }`}
                    title="Toggle Clock Sound Loop (1 Medium Sound)"
                  >
                    <Clock className={`w-2.5 h-2.5 ${audioSettings.timerSoundEnabled ? 'text-purple-400' : 'text-slate-500'}`} />
                    <span>Clock Sound</span>
                    {audioSettings.timerSoundEnabled && <Check className="w-2.5 h-2.5 text-purple-400 stroke-[3]" />}
                  </button>
                </div>
              )}

              {isSetupExpanded && audioSettings && onUpdateAudioSettings && (
                <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl space-y-3 shadow-inner my-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Play className="w-3 h-3 text-blue-400 shrink-0" />
                      <div>
                        <div className="text-[10px] font-bold text-slate-200">Auto Play Test Intro</div>
                        <div className="text-[9px] text-slate-500 leading-tight">Play Blue Test Intro once at start.</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!audioSettings.autoplayTestIntro}
                      onChange={(e) =>
                        onUpdateAudioSettings({
                          ...audioSettings,
                          autoplayTestIntro: e.target.checked,
                          autoplayPackageIntro: e.target.checked,
                        })
                      }
                      className="w-3.5 h-3.5 text-blue-500 bg-slate-800 border-slate-700 rounded focus:ring-blue-500/50"
                      title="Auto Play Test Intro"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Layers className="w-3 h-3 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-[10px] font-bold text-slate-200">Auto Play Session Intro</div>
                        <div className="text-[9px] text-slate-500 leading-tight">Play Session Intro when entering a new session.</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!audioSettings.autoplaySessionIntro}
                      onChange={(e) => onUpdateAudioSettings({ ...audioSettings, autoplaySessionIntro: e.target.checked })}
                      className="w-3.5 h-3.5 text-blue-500 bg-slate-800 border-slate-700 rounded focus:ring-blue-500/50"
                      title="Auto Play Session Intro"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <HelpCircle className="w-3 h-3 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-[10px] font-bold text-slate-200">Auto Play Question Audio</div>
                        <div className="text-[9px] text-slate-500 leading-tight">Play unique Question / Challenge audio.</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!audioSettings.autoplayChallengeAudio}
                      onChange={(e) =>
                        onUpdateAudioSettings({
                          ...audioSettings,
                          autoplayChallengeAudio: e.target.checked,
                          autoplayQuestionCue: e.target.checked,
                          autoplayQuestionNumber: e.target.checked,
                        })
                      }
                      className="w-3.5 h-3.5 text-blue-500 bg-slate-800 border-slate-700 rounded focus:ring-blue-500/50"
                      title="Auto Play Challenge Audio"
                    />
                  </div>
                  
                  <div className="border-t border-slate-800/80 pt-2 mt-2 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <div>
                          <div className="text-[10px] font-bold text-slate-200">Clock Sound (Medium)</div>
                          <div className="text-[9px] text-slate-500 leading-tight">1 steady medium clock sound loop during timing.</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={!!audioSettings.timerSoundEnabled}
                        onChange={(e) => onUpdateAudioSettings({ ...audioSettings, timerSoundEnabled: e.target.checked })}
                        className="w-3.5 h-3.5 text-purple-500 bg-slate-800 border-slate-700 rounded focus:ring-purple-500/50"
                        title="Clock Sound Loop Enabled"
                      />
                    </div>
                    {audioSettings.timerSoundEnabled && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-bold text-slate-200">Clock Volume</div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={audioSettings.timerSoundVolume ?? 0.5}
                            onChange={(e) => onUpdateAudioSettings({ ...audioSettings, timerSoundVolume: parseFloat(e.target.value) })}
                            className="w-20 accent-purple-500"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {(() => {
                            const v = AudioStorageAdapter.getActiveVersion('blue_test_clock_medium') || AudioStorageAdapter.getActiveVersion('blue_test_clock_slow') || AudioStorageAdapter.getActiveVersion('blue_test_clock_urgent');
                            return v ? (
                              <button
                                type="button"
                                onClick={() => {
                                  stopNarration();
                                  playClockLoop(v.audioUrl, audioSettings.timerSoundVolume ?? 0.5);
                                  setTimeout(() => stopClockLoop(), 2500);
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-purple-300 border border-slate-700 uppercase flex items-center gap-1.5"
                                title="Preview Clock Sound"
                              >
                                <Clock className="w-3 h-3 text-purple-400" />
                                Preview Clock Sound
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  stopNarration();
                                  playClockLoop(null, audioSettings.timerSoundVolume ?? 0.5);
                                  setTimeout(() => stopClockLoop(), 2500);
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-purple-300 border border-slate-700 uppercase flex items-center gap-1.5"
                                title="Preview Synthesized Clock"
                              >
                                <Clock className="w-3 h-3 text-purple-400" />
                                Preview Synth Clock
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Speed Control Row */}
            <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-800/80">
              <span className="text-[10px] font-semibold text-slate-400">Audio Speed:</span>
              <div className="flex items-center gap-1">
                {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handleSpeedChange(rate)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-black transition-all ${
                      activeSpeed === rate
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                    }`}
                    title={`Set audio speed to ${rate}x`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Player Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Quick Clock Sound Toggle Button */}
              {audioSettings && onUpdateAudioSettings && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateAudioSettings({
                      ...audioSettings,
                      timerSoundEnabled: !audioSettings.timerSoundEnabled,
                    })
                  }
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 border transition-all ${
                    audioSettings.timerSoundEnabled
                      ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 shadow-sm ring-1 ring-purple-400/50'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
                  }`}
                  title={`Clock Sound Loop: ${audioSettings.timerSoundEnabled ? 'ENABLED (1 Medium Sound)' : 'DISABLED'} - Click to toggle`}
                >
                  <Clock className={`w-3.5 h-3.5 ${audioSettings.timerSoundEnabled ? 'text-purple-200' : 'text-slate-400'}`} />
                  <span>Clock: {audioSettings.timerSoundEnabled ? 'ON' : 'OFF'}</span>
                </button>
              )}

              {narrationStatus?.isPlaying && onPauseNarration && (
                <button
                  onClick={onPauseNarration}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs transition-all"
                  title="Pause active narration"
                >
                  <Pause className="w-3 h-3" />
                  <span>Pause</span>
                </button>
              )}

              {narrationStatus?.isPaused && onResumeNarration && (
                <button
                  onClick={onResumeNarration}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs transition-all"
                  title="Resume narration"
                >
                  <Play className="w-3 h-3" />
                  <span>Resume</span>
                </button>
              )}

              {(narrationStatus?.isPlaying || narrationStatus?.isPaused) && onRestartNarration && (
                <button
                  onClick={onRestartNarration}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                  title="Restart narration"
                >
                  <RotateCcw className="w-3 h-3 text-blue-400" />
                </button>
              )}

              {(narrationStatus?.isPlaying || narrationStatus?.isPaused) && onStopNarration && (
                <button
                  onClick={onStopNarration}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-200 text-slate-300 border border-slate-700"
                  title="Stop narration"
                >
                  <Square className="w-3 h-3 text-rose-400" />
                </button>
              )}

              {/* Default Trigger Buttons */}
              {!narrationStatus?.isPlaying && !narrationStatus?.isPaused && (
                <div className="grid grid-cols-3 gap-1 w-full">
                  <button
                    onClick={onPlayTestIntro || handlePlayPackageIntro}
                    disabled={isTimerRunning}
                    className={`px-1 py-1.5 rounded-lg text-[9px] font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                      isTimerRunning
                        ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                        : 'bg-blue-600/80 hover:bg-blue-500 text-white border-blue-500/30 shadow-xs'
                    }`}
                    title="Play Blue Test Intro"
                  >
                    <Play className="w-3 h-3 text-white fill-white/20" />
                    <span className="truncate">Test Intro</span>
                  </button>

                  <button
                    onClick={() =>
                      onPlaySessionIntro
                        ? onPlaySessionIntro(activeSessionNumber)
                        : handlePlaySessionIntro(activeSessionNumber)
                    }
                    disabled={isTimerRunning}
                    className={`px-1 py-1.5 rounded-lg text-[9px] font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                      isTimerRunning
                        ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    }`}
                    title={`Play Session ${activeSessionNumber} Intro`}
                  >
                    <Layers className="w-3 h-3 text-emerald-400" />
                    <span className="truncate">S{activeSessionNumber} Intro</span>
                  </button>

                  <button
                    onClick={handlePlayQuestionCue}
                    disabled={isTimerRunning}
                    className={`px-1 py-1.5 rounded-lg text-[9px] font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                      isTimerRunning
                        ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                    }`}
                    title={`Play Question ${currentQuestionInSession || ((currentGlobalOrder - 1) % 7 + 1)} Cue`}
                  >
                    <HelpCircle className="w-3 h-3 text-amber-400" />
                    <span className="truncate">Q{currentQuestionInSession || ((currentGlobalOrder - 1) % 7 + 1)} Audio</span>
                  </button>
                </div>
              )}
            </div>

            {/* End Test Button */}
            {onEndTest && (
              <button
                onClick={onEndTest}
                className="w-full mt-1.5 px-2.5 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-[11px] font-extrabold flex items-center justify-center gap-1.5 border border-rose-500/40 shadow-xs transition-all"
                title="End Test (Kết thúc Bài Test)"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>End Test (Kết thúc Bài Test)</span>
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
