import React, { useState } from 'react';
import { BlueQuestionAttempt, SevenColor } from '../../types/blue-test';
import { SEVEN_COLORS_ORDERED, getSevenColorDefinition, calculateEffectiveValues } from '../../domain/blue-test/color-engine';
import { ChallengeStatusPopup } from './ChallengeStatusPopup';
import { X, AlertCircle, CheckCircle, ShieldAlert, RotateCcw } from 'lucide-react';

interface BlueTestCorrectionModalProps {
  attempt: BlueQuestionAttempt;
  onClose: () => void;
  onSaveCorrection: (newColor: SevenColor, reason: string, newStoppedAtChallengeIndex?: number) => void;
  onResetAttempt?: () => void;
}

export const BlueTestCorrectionModal: React.FC<BlueTestCorrectionModalProps> = ({
  attempt,
  onClose,
  onSaveCorrection,
  onResetAttempt,
}) => {
  const [selectedColor, setSelectedColor] = useState<SevenColor>(attempt.effectiveColor);
  const [selectedChallengeIndex, setSelectedChallengeIndex] = useState<number>(
    attempt.stoppedAtChallengeIndex ?? attempt.globalQuestionOrder
  );
  const [activePopupChallenge, setActivePopupChallenge] = useState<number | null>(null);
  const [reason, setReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const originalColorDef = getSevenColorDefinition(attempt.derivedColorAtStop);

  const effectivePreview = calculateEffectiveValues(
    selectedColor,
    attempt.maxTimeSecondsRaw,
    attempt.elapsedSecondsRaw,
    attempt.completionRatio,
    attempt.derivedColorAtStop
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('Correction reason is required. Please provide a clear explanation for rescoring.');
      return;
    }
    setErrorMsg('');
    onSaveCorrection(selectedColor, reason.trim(), selectedChallengeIndex);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 text-white shadow-2xl space-y-4 sm:space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Correct / Rescore Result</h3>
              <p className="text-xs text-slate-400">
                Question {attempt.globalQuestionOrder} (Session {attempt.sessionNumber}, Q{attempt.questionInSession})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Observation Details Card */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400" title="Max Conscious Time">Max Conscious Time (MCT):</span>
            <span className="font-mono font-bold text-white text-sm">{attempt.elapsedSecondsRaw.toFixed(2)}s</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400" title="Threshold Conscious Time">TCT (Threshold Conscious Time):</span>
            <span className="font-mono text-slate-300">{attempt.maxTimeSecondsRaw.toFixed(2)}s</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
            <span className="text-slate-400">Derived Color at Stop:</span>
            <span
              className="px-2.5 py-0.5 rounded-full font-bold text-white text-[11px]"
              style={{ backgroundColor: originalColorDef.hex }}
            >
              {originalColorDef.labelEn}
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Color Selector Grid */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Select Effective Color:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SEVEN_COLORS_ORDERED.map((def) => {
                const isSelected = selectedColor === def.color;
                return (
                  <button
                    key={def.color}
                    type="button"
                    onClick={() => setSelectedColor(def.color)}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                      isSelected
                        ? 'ring-2 ring-blue-400 border-transparent shadow-md'
                        : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
                    }`}
                    style={{
                      backgroundColor: isSelected ? def.hex : undefined,
                      color: isSelected ? '#FFFFFF' : undefined,
                    }}
                  >
                    <span>{def.labelEn}</span>
                    
                  </button>
                );
              })}
            </div>
          </div>

          {/* Challenge Stopped Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Recorded Challenge Stopped At (C1 to C{attempt.globalQuestionOrder}):
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-950/80 border border-slate-800 rounded-xl">
              {Array.from({ length: attempt.globalQuestionOrder }, (_, i) => i + 1).map((cIndex) => {
                const isSelected = selectedChallengeIndex === cIndex;
                return (
                  <button
                    key={cIndex}
                    type="button"
                    onClick={() => setActivePopupChallenge(cIndex)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm ring-1 ring-blue-400'
                        : 'bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    C{cIndex}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">
              {selectedChallengeIndex > attempt.globalQuestionOrder ? (
                <span>Evaluation: <strong className="text-emerald-400">All C1..C{attempt.globalQuestionOrder} PASSED</strong></span>
              ) : (
                <span>
                  Stopped at: <strong className="text-blue-400">C{selectedChallengeIndex}</strong> (
                  {selectedChallengeIndex > 1 ? `C1..C${selectedChallengeIndex - 1}: Passed, ` : ''}
                  C{selectedChallengeIndex}: Failed
                  {selectedChallengeIndex < attempt.globalQuestionOrder
                    ? `, C${selectedChallengeIndex + 1}..C${attempt.globalQuestionOrder}: Not Attempted`
                    : ''}
                  )
                </span>
              )}
            </p>
          </div>

          {/* Interactive Challenge Popup Card */}
          {activePopupChallenge !== null && (
            <ChallengeStatusPopup
              challengeIndex={activePopupChallenge}
              totalChallengesInQuestion={attempt.globalQuestionOrder}
              onSelectPassed={() => {
                const k = attempt.globalQuestionOrder;
                const x = activePopupChallenge;
                const newStopped = x < k ? x + 1 : k + 1;
                setSelectedChallengeIndex(newStopped);
              }}
              onSelectFailed={() => {
                setSelectedChallengeIndex(activePopupChallenge);
              }}
              onClose={() => setActivePopupChallenge(null)}
            />
          )}

          {/* Effective Values Preview Card */}
          <div className="bg-blue-950/40 p-3.5 rounded-xl border border-blue-800/60 text-xs space-y-1.5">
            <div className="font-bold text-blue-300 flex items-center justify-between">
              <span>Recalculated Effective Result Preview:</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-blue-900 text-blue-200 rounded">
                {selectedColor === attempt.derivedColorAtStop ? 'Uncorrected' : 'Corrected'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300 font-mono">
              <span>Effective Completion:</span>
              <span className="font-bold text-white">
                {(effectivePreview.effectiveCompletionRatio * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300 font-mono">
              <span>Effective Time:</span>
              <span className="font-bold text-white">
                {effectivePreview.effectiveElapsedSeconds.toFixed(2)}s
              </span>
            </div>
            <p className="text-[10px] text-slate-400 italic pt-1 border-t border-blue-900/40">
              Original observed measurement ({attempt.elapsedSecondsRaw.toFixed(2)}s / {(attempt.completionRatio * 100).toFixed(1)}%) will be preserved for audit history.
            </p>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Correction Reason <span className="text-rose-400">*</span>:
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim()) setErrorMsg('');
              }}
              placeholder="Provide teacher observation notes explaining why this question score is being corrected..."
              className="w-full h-24 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Error display */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            {onResetAttempt ? (
              <button
                type="button"
                onClick={onResetAttempt}
                className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs transition-colors flex items-center gap-1.5"
                title="Xóa kết quả cũ và thực thi lại câu này (Chưa thực thi)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Try Again (Làm lại câu này)
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Save Rescore
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
