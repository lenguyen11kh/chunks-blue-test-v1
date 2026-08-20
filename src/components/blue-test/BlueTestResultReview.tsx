import React, { useEffect, useRef, useState } from 'react';
import { BlueQuestionAttempt } from '../../types/blue-test';
import { getSevenColorDefinition, getEffectiveAttemptValues } from '../../domain/blue-test/color-engine';
import { predictChallengeIndexFromElapsed } from '../../domain/blue-test/timing-engine';
import { BlueTestStorageAdapter } from '../../persistence/blue-test-storage';
import { playScoreEffect } from '../../audio/audio-service';
import {
  ArrowRight,
  RotateCcw,
  Edit3,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Target,
  Sparkles,
} from 'lucide-react';

interface BlueTestResultReviewProps {
  attempt: BlueQuestionAttempt;
  totalQuestions?: number; // 49
  onNextQuestion: () => void;
  onOpenCorrection: () => void;
  onTryAgain?: () => void;
  onReplayEndBell?: () => void;
  isErrorState?: boolean;
  onRetrySave?: () => void;
  onUpdateAttempt?: (updated: BlueQuestionAttempt) => void;
  isCaptainMode?: boolean;
}

export const BlueTestResultReview: React.FC<BlueTestResultReviewProps> = ({
  attempt: initialAttempt,
  totalQuestions = 49,
  onNextQuestion,
  onOpenCorrection,
  onTryAgain,
  onReplayEndBell,
  isErrorState = false,
  onRetrySave,
  onUpdateAttempt,
  isCaptainMode = false,
}) => {
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  const [currentAttempt, setCurrentAttempt] = useState<BlueQuestionAttempt>(initialAttempt);

  useEffect(() => {
    setCurrentAttempt(initialAttempt);
  }, [initialAttempt]);

  const attempt = currentAttempt;

  // 1.5s Interaction lock to prevent accidental Spacebar double-taps
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [lockCountdownMs, setLockCountdownMs] = useState<number>(1500);
  const [keyReleasedSinceOpen, setKeyReleasedSinceOpen] = useState<boolean>(false);

  useEffect(() => {
    setIsLocked(true);
    setLockCountdownMs(1500);
    setKeyReleasedSinceOpen(false);

    const { effectiveCompletionRatio } = getEffectiveAttemptValues(attempt);
    playScoreEffect(effectiveCompletionRatio);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1500 - elapsed);
      setLockCountdownMs(remaining);
      if (remaining <= 0) {
        setIsLocked(false);
        clearInterval(interval);
      }
    }, 50);

    // Auto-focus primary button
    if (primaryButtonRef.current) {
      primaryButtonRef.current.focus();
    }

    return () => clearInterval(interval);
  }, [attempt.id]);

  // Handle global keydown/keyup for Space or Enter key continuation
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        setKeyReleasedSinceOpen(true);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code !== 'Space' && e.code !== 'Enter') || e.repeat) return;

      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (!isLocked && keyReleasedSinceOpen && !isErrorState) {
        e.preventDefault();
        onNextQuestion();
      }
    };

    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLocked, keyReleasedSinceOpen, isErrorState, onNextQuestion]);

  const applyNewStoppedIndex = (newStopped: number) => {
    try {
      const { attempt: updated } = BlueTestStorageAdapter.correctAttempt({
        attemptId: attempt.id,
        newEffectiveColor: attempt.effectiveColor,
        reason: `Xác nhận động tác dừng C${newStopped > attempt.globalQuestionOrder ? 'Tất cả ĐẠT' : newStopped}`,
        newStoppedAtChallengeIndex: newStopped,
        actor: 'Teacher',
      });
      setCurrentAttempt(updated);
      if (onUpdateAttempt) {
        onUpdateAttempt(updated);
      }
    } catch (err) {
      console.error('Failed to update challenge stopped index:', err);
    }
  };

  const effectiveDef = getSevenColorDefinition(attempt.effectiveColor);
  const { effectiveElapsedSeconds, effectiveCompletionRatio } = getEffectiveAttemptValues(attempt);

  const displayEffectiveElapsed = effectiveElapsedSeconds.toFixed(1);
  const displayMax = attempt.maxTimeSecondsRaw.toFixed(1);
  const effectivePercentVal = Math.round(effectiveCompletionRatio * 100);

  const totalC = attempt.globalQuestionOrder;
  const timePerChallenge = (attempt.maxTimeSecondsRaw / totalC).toFixed(2);
  const predictedIndex = predictChallengeIndexFromElapsed(
    attempt.elapsedSecondsRaw,
    attempt.maxTimeSecondsRaw,
    totalC
  );

  const stoppedIndex = attempt.stoppedAtChallengeIndex ?? predictedIndex;
  const isAllPassed = stoppedIndex > totalC;

  const isLastQuestion = attempt.globalQuestionOrder === totalQuestions;
  const isSessionEnd = attempt.questionInSession === 7;

  let primaryActionText = isCaptainMode ? 'CONFIRM & NEXT QUESTION' : 'XÁC NHẬN & CHUYỂN CÂU TIẾP THEO';
  if (isLastQuestion) {
    primaryActionText = isCaptainMode ? 'COMPLETE TEST SUMMARY' : 'TỔNG KẾT BÀI TEST';
  } else if (isSessionEnd) {
    primaryActionText = isCaptainMode
      ? `CONTINUE TO SESSION ${attempt.sessionNumber + 1} INTRO`
      : `TIẾP TỤC SESSION ${attempt.sessionNumber + 1} INTRO`;
  }

  return (
    <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-xl w-full mx-auto animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden my-auto">
      {/* Sleek Minimal Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-5 bg-slate-950/80 shrink-0">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold text-xs rounded-full">
            Session {attempt.sessionNumber}
          </span>
          <span className="font-extrabold text-sm text-slate-200">
            {isCaptainMode ? 'Question Q' : 'Câu Q'}{attempt.globalQuestionOrder} <span className="text-slate-500 font-normal">/ {totalQuestions}</span>
          </span>
        </div>

        <div className="text-xs font-mono font-bold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
          {displayEffectiveElapsed}s / {displayMax}s
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Persistence Error Notice */}
        {isErrorState && (
          <div className="p-3 bg-rose-950/80 border border-rose-500/50 rounded-xl flex items-center justify-between text-xs text-rose-200">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{isCaptainMode ? 'Unable to save result. Please try again.' : 'Chưa lưu được kết quả. Vui lòng thử lại.'}</span>
            </div>
            {onRetrySave && (
              <button
                onClick={onRetrySave}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition-all text-xs shrink-0 cursor-pointer"
              >
                {isCaptainMode ? 'Retry' : 'Thử lại'}
              </button>
            )}
          </div>
        )}

        {/* Dynamic Color & Time Summary Card */}
        <div
          className="p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-md"
          style={{
            backgroundColor: `${effectiveDef.hex}15`,
            borderColor: `${effectiveDef.hex}50`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm shadow-md shrink-0"
              style={{ backgroundColor: effectiveDef.hex }}
            >
              {attempt.effectiveColor.substring(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="font-black text-sm sm:text-base text-white flex items-center gap-2">
                <span>{effectiveDef.labelEn}</span>
                <span className="text-xs font-mono font-normal opacity-80">({effectivePercentVal}%)</span>
              </div>
              <p className="text-xs text-slate-300">
                {displayEffectiveElapsed}s / {displayMax}s {isCaptainMode ? '(DT / TDT)' : `(${totalC} động tác)`}
              </p>
            </div>
          </div>

          {!isCaptainMode && (
            <div className="text-right text-[11px] font-mono text-slate-400">
              <span>Dự đoán: {predictedIndex > totalC ? 'Tất cả ĐẠT' : `Lỗi C${predictedIndex}`}</span>
            </div>
          )}
        </div>

        {/* Minimal Challenge Selection Box - HIDE IN CAPTAIN MODE */}
        {!isCaptainMode && (
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-amber-400" />
                <span>Xác nhận động tác dừng ({totalC} C_m):</span>
              </span>

              <span className="text-[11px] font-mono text-amber-300/90">
                ~{timePerChallenge}s / động tác
              </span>
            </div>

            {/* Quick Option Row: All Passed vs Failed at C_m */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => applyNewStoppedIndex(totalC + 1)}
                className={`py-2 px-3 rounded-xl border font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isAllPassed
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/50'
                    : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <span>🟩 Tất cả C1..C{totalC} ĐẠT</span>
              </button>

              <div
                className={`py-2 px-3 rounded-xl border font-bold text-center flex items-center justify-center gap-1.5 ${
                  !isAllPassed
                    ? 'bg-rose-500/20 border-rose-500 text-rose-300 ring-1 ring-rose-500/50'
                    : 'bg-slate-800/80 border-slate-700 text-slate-500'
                }`}
              >
                <span>{isAllPassed ? '🟥 Dừng ở C_m' : `🟥 Dừng ở C${stoppedIndex}`}</span>
              </div>
            </div>

            {/* Compact Pill List C1..Ck */}
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-slate-900/80 rounded-xl border border-slate-800">
              {Array.from({ length: totalC }, (_, i) => i + 1).map((cIndex) => {
                const isFailedAtThis = stoppedIndex === cIndex;
                const isPassedBefore = stoppedIndex > cIndex;

                let btnClass = 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-700';
                if (isFailedAtThis) {
                  btnClass = 'bg-rose-600 text-white border-rose-400 font-black scale-105 shadow-md ring-2 ring-rose-400';
                } else if (isPassedBefore) {
                  btnClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60 font-semibold';
                }

                return (
                  <button
                    key={cIndex}
                    type="button"
                    onClick={() => applyNewStoppedIndex(cIndex)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all border cursor-pointer ${btnClass}`}
                    title={isFailedAtThis ? `C${cIndex} bị lỗi` : `Đánh dấu lỗi tại C${cIndex}`}
                  >
                    {isFailedAtThis ? `❌ C${cIndex}` : isPassedBefore ? `✓ C${cIndex}` : `C${cIndex}`}
                  </button>
                );
              })}
            </div>

            {/* Status Text */}
            <div className="text-[11px] font-mono text-slate-400 text-center">
              {isAllPassed ? (
                <span className="text-emerald-400 font-bold">✓ Đạt 100% tất cả {totalC} động tác</span>
              ) : (
                <span className="text-amber-300">
                  Đạt <strong className="text-emerald-400">{stoppedIndex - 1}/{totalC}</strong> động tác • Lỗi ở <strong className="text-rose-400">C{stoppedIndex}</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Primary Action Safeguard Button */}
        <button
          ref={primaryButtonRef}
          onClick={() => {
            if (!isLocked && !isErrorState) {
              onNextQuestion();
            }
          }}
          disabled={isLocked || isErrorState}
          className={`w-full py-3.5 px-5 rounded-2xl font-black text-xs sm:text-sm text-white shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            isLocked || isErrorState
              ? 'bg-slate-800 text-slate-500 border border-slate-700/80 cursor-not-allowed opacity-80'
              : 'bg-blue-600 hover:bg-blue-500 active:scale-98 ring-2 ring-blue-400/50 shadow-blue-600/30'
          }`}
        >
          {isLocked ? (
            <>
              <Clock className="w-4 h-4 text-amber-400 animate-spin" />
              <span>
                {isCaptainMode
                  ? `🔒 LOCKED (${(lockCountdownMs / 1000).toFixed(1)}s) - PLEASE CONFIRM`
                  : `🔒 ĐANG KHÓA (${(lockCountdownMs / 1000).toFixed(1)}s) - CHỜ XÁC NHẬN`}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>🎯 {primaryActionText}</span>
              <kbd className="ml-1.5 px-2 py-0.5 bg-slate-900/80 border border-white/20 rounded font-mono text-[10px] text-white">
                Space / Enter
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Subtle Utility Footer */}
      <div className="bg-slate-950 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs gap-2 shrink-0">
        <div className="flex items-center gap-2">
          {onTryAgain && (
            <button
              onClick={onTryAgain}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 transition-all flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {isCaptainMode ? 'Try Again' : 'Làm lại'}
            </button>
          )}

          <button
            onClick={onOpenCorrection}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold border border-slate-700 transition-all flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" /> {isCaptainMode ? 'Edit Result' : 'Sửa kết quả'}
          </button>
        </div>

        {onReplayEndBell && (
          <button
            onClick={onReplayEndBell}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold border border-slate-700 transition-all flex items-center gap-1 cursor-pointer"
            title="Replay End Bell"
          >
            <Volume2 className="w-3.5 h-3.5" /> {isCaptainMode ? 'Bell' : 'Chuông'}
          </button>
        )}
      </div>
    </div>
  );
};


