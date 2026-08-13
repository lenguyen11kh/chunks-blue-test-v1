import React from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

interface ChallengeStatusPopupProps {
  challengeIndex: number; // x (1..k or 1..49)
  totalChallengesInQuestion: number; // k
  onSelectPassed: () => void;
  onSelectFailed: () => void;
  onClose: () => void;
}

export const ChallengeStatusPopup: React.FC<ChallengeStatusPopupProps> = ({
  challengeIndex,
  totalChallengesInQuestion,
  onSelectPassed,
  onSelectFailed,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50 duration-150"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl max-w-xs w-full text-white space-y-4 animate-in zoom-in-95 duration-150 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h4 className="font-extrabold text-sm text-slate-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs"></span>
            Challenge C{challengeIndex} Status
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Select evaluation status for <strong>Challenge C{challengeIndex}</strong> (Question order Q{totalChallengesInQuestion}):
        </p>

        {/* Options */}
        <div className="space-y-2.5">
          {/* Green PASSED Button */}
          <button
            type="button"
            onClick={() => {
              onSelectPassed();
              onClose();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200 group-hover:scale-110 transition-transform" />
              <span>🟩 PASSED (Đạt)</span>
            </div>
            <span className="text-[10px] text-emerald-200 font-medium">
              C1..C{challengeIndex} Passed
            </span>
          </button>

          {/* Red FAILED Button */}
          <button
            type="button"
            onClick={() => {
              onSelectFailed();
              onClose();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-200 group-hover:scale-110 transition-transform" />
              <span>🟥 FAILED (Chưa đạt)</span>
            </div>
            <span className="text-[10px] text-rose-200 font-medium">
              Stopped at C{challengeIndex}
            </span>
          </button>
        </div>

        <div className="text-[10px] text-slate-500 text-center font-mono pt-1 border-t border-slate-800/80">
          Click outside to dismiss
        </div>
      </div>
    </div>
  );
};
