import React, { useState } from 'react';
import { BlueQuestionAttempt } from '../../types/blue-test';
import {
  calculateChallengeMatrix,
  calculatePercentIMetrics,
} from '../../domain/blue-test/metrics-engine';
import { BlueTestStorageAdapter } from '../../persistence/blue-test-storage';
import { ChallengeStatusPopup } from './ChallengeStatusPopup';
import {
  Grid,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Activity,
  Award,
  RotateCcw,
  Info,
  Filter,
  Check,
  X as XIcon,
  Minus,
  Star,
  Clock,
  Layers,
  HelpCircle as QuestionIcon,
} from 'lucide-react';

interface BlueTestChallengeMatrixViewProps {
  attempts: BlueQuestionAttempt[];
  showTopMetrics?: boolean;
  title?: string;
  learnerName?: string;
  assignmentId?: string;
  onAttemptUpdated?: () => void;
}

export type RowFilterOption = 'all' | 'failed' | 'pending' | 'mastered';

export const BlueTestChallengeMatrixView: React.FC<BlueTestChallengeMatrixViewProps> = ({
  attempts,
  showTopMetrics = true,
  title = 'Cumulative Component Matrix (49 × 49)',
  learnerName,
  assignmentId,
  onAttemptUpdated,
}) => {
  const matrixData = calculateChallengeMatrix(attempts);
  const percentIMetrics = calculatePercentIMetrics(attempts);

  const percentIVal =
    percentIMetrics.provisionalPercentI !== null
      ? `${percentIMetrics.provisionalPercentI.toFixed(1)}%`
      : '—';
  const actVal = `${matrixData.actSeconds.toFixed(2)}s`;
  const percentCpdVal = `${matrixData.percentCPD.toFixed(1)}%`;
  const accnVal = matrixData.accn.toFixed(2);

  // Top metric counters
  const masteredComponentsCount = matrixData.totalClearedCount;
  const pendingAssessmentsCount = 49 - masteredComponentsCount;

  // Filter state for Rows: 'all' | 'failed' | 'pending' | 'mastered'
  const [rowFilter, setRowFilter] = useState<RowFilterOption>('all');
  const [matrixSessionFilter, setMatrixSessionFilter] = useState<number | 'all'>('all');

  const [hoveredCell, setHoveredCell] = useState<{ k: number; j: number } | null>(null);
  const [activePopup, setActivePopup] = useState<{ questionOrder: number; challengeIndex: number } | null>(null);

  const handleApplyChallengeStatus = (questionOrder: number, challengeIndex: number, isPassed: boolean) => {
    const targetAttempt = attempts.find((a) => a.globalQuestionOrder === questionOrder);
    if (!targetAttempt) return;

    const k = questionOrder;
    const x = challengeIndex;
    const newStopped = isPassed ? (x < k ? x + 1 : k + 1) : x;

    try {
      BlueTestStorageAdapter.correctAttempt({
        attemptId: targetAttempt.id,
        newEffectiveColor: targetAttempt.effectiveColor,
        reason: `Teacher set matrix challenge C${x} for Q${k} to ${isPassed ? 'PASSED' : 'FAILED'}`,
        newStoppedAtChallengeIndex: newStopped,
        actor: 'Teacher',
      });
      if (onAttemptUpdated) {
        onAttemptUpdated();
      }
    } catch (err) {
      console.error('Failed to update challenge from matrix:', err);
    }
  };

  // Determine row status for Q_k
  const getRowStatus = (k: number): 'mastered' | 'failed' | 'pending' => {
    const attempt = attempts.find((a) => a.globalQuestionOrder === k);
    if (!attempt) return 'pending';

    let hasFailure = false;
    let allPassed = true;

    for (let j = 1; j <= k; j++) {
      const status = matrixData.matrix[k][j];
      if (status === 'failed') {
        hasFailure = true;
        allPassed = false;
      } else if (status !== 'passed') {
        allPassed = false;
      }
    }

    if (hasFailure) return 'failed';
    if (allPassed) return 'mastered';
    return 'pending';
  };

  // Filter question orders Q1..Q49
  const baseQuestionOrders =
    matrixSessionFilter === 'all'
      ? Array.from({ length: 49 }, (_, k) => k + 1)
      : Array.from({ length: 7 }, (_, idx) => (Number(matrixSessionFilter) - 1) * 7 + idx + 1);

  const filteredQuestionOrders = baseQuestionOrders.filter((k) => {
    if (rowFilter === 'all') return true;
    const rowStatus = getRowStatus(k);
    return rowStatus === rowFilter;
  });

  const challengeIndices = Array.from({ length: 49 }, (_, j) => j + 1);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top 4 Metrics Summary Section */}
      {showTopMetrics && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-400" /> Key Performance Indicators & Matrix Metrics
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. %i Card */}
            <div
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-2 relative overflow-hidden group hover:border-blue-500/50 transition-all cursor-help"
              title="% Requested conscious flow maintained (Total MCT ÷ Total TCT)"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 lowercase tracking-wide">
                  %i Index
                </span>
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-3xl font-black text-white font-mono">{percentIVal}</div>
              <p className="text-[11px] text-slate-400 font-medium">
                % Requested conscious flow maintained
              </p>
            </div>

            {/* 2. ACT Card */}
            <div
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-2 relative overflow-hidden group hover:border-indigo-500/50 transition-all cursor-help"
              title="Average conscious time in seconds (Total MCT ÷ 49)"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400 tracking-wide">
                  ACT
                </span>
                <Activity className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-3xl font-black text-white font-mono">{actVal}</div>
              <p className="text-[11px] text-slate-400 font-medium">
                Average conscious time per question
              </p>
            </div>

            {/* 3. %CPD Card (Ocean Blue Theme) */}
            <div
              className="bg-blue-950/60 border border-blue-500/50 rounded-2xl p-5 shadow-lg space-y-2 relative overflow-hidden group hover:border-blue-400 transition-all cursor-help"
              title="% MSE challenges ultimately managed (% Challenges Cleared ÷ 49)"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 tracking-wide uppercase">
                  %CPD
                </span>
                <CheckCircle2 className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-3xl font-black text-blue-400 font-mono">{percentCpdVal}</div>
              <p className="text-[11px] text-blue-300/80 font-medium">
                % MSE challenges cleared ({masteredComponentsCount}/49)
              </p>
            </div>

            {/* 4. ACCN Card */}
            <div
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-2 relative overflow-hidden group hover:border-amber-500/50 transition-all cursor-help"
              title="Wrong repetitions (MCCN) before successful change (Total MCCN ÷ 49)"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 tracking-wide">
                  ACCN
                </span>
                <RotateCcw className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-black text-amber-400 font-mono">{accnVal}</div>
              <p className="text-[11px] text-slate-400 font-medium">
                Wrong repetitions before successful change
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Matrix Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-5">
        {/* Header Block with Title & Top Summary Badges */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <h3 className="font-black text-xl text-white flex items-center gap-2.5">
              <Grid className="w-6 h-6 text-blue-500" />
              {title}
            </h3>
            {(learnerName || assignmentId) && (
              <p className="text-xs text-slate-400 font-medium flex items-center gap-2">
                {learnerName && <span>Learner: <strong className="text-slate-200">{learnerName}</strong></span>}
                {learnerName && assignmentId && <span>•</span>}
                {assignmentId && <span>Assignment ID: <code className="text-blue-400 font-mono">{assignmentId}</code></span>}
              </p>
            )}
          </div>

          {/* Header Stat Cards (Matching UI screenshot) */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* % CPD Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-center min-w-[130px] flex-1 sm:flex-initial">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                % CPD (MSE CLEARED)
              </span>
              <span className="text-lg font-black text-blue-400 font-mono block">
                {percentCpdVal}
              </span>
              <span className="text-[10px] text-slate-500 block font-medium">
                {masteredComponentsCount} / 49 components
              </span>
            </div>

            {/* Mastered Components Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-center min-w-[140px] flex-1 sm:flex-initial">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                MASTERED COMPONENTS
              </span>
              <span className="text-lg font-black text-emerald-400 font-mono block">
                {masteredComponentsCount}
              </span>
              <span className="text-[10px] text-slate-500 block font-medium">
                Passed at least once
              </span>
            </div>

            {/* Pending Assessments Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-center min-w-[140px] flex-1 sm:flex-initial">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                PENDING ASSESSMENTS
              </span>
              <span className="text-lg font-black text-amber-400 font-mono block">
                {pendingAssessmentsCount}
              </span>
              <span className="text-[10px] text-slate-500 block font-medium">
                Requires Teacher Entry
              </span>
            </div>
          </div>
        </div>

        {/* Filter Rows Toolbar & Quick Symbol Legend (Matching UI Screenshot) */}
        <div className="bg-slate-950 p-3.5 sm:p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          {/* Left: Row Filter Options */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <div className="flex items-center gap-1.5 text-slate-300 font-extrabold pr-2">
              <Filter className="w-4 h-4 text-blue-400" />
              <span>Filter Rows:</span>
            </div>

            <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl gap-1">
              {(['all', 'failed', 'pending', 'mastered'] as RowFilterOption[]).map((option) => {
                const isActive = rowFilter === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRowFilter(option)}
                    className={`px-3.5 py-1.5 rounded-lg font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {/* Optional Session Filter Dropdown */}
            <select
              value={matrixSessionFilter}
              onChange={(e) =>
                setMatrixSessionFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="bg-slate-900 text-slate-300 border border-slate-800 rounded-xl px-3 py-1.5 font-bold text-xs focus:outline-none cursor-pointer"
            >
              <option value="all">All 7 Sessions</option>
              {Array.from({ length: 7 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Session {i + 1} (Q{i * 7 + 1}-Q{(i + 1) * 7})
                </option>
              ))}
            </select>
          </div>

          {/* Right: Quick Cell Indicators / Legend */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-bold w-full md:w-auto justify-start md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-800">
            {/* Passed */}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-[10px] font-black">
                ✓
              </span>
              <span className="text-emerald-400">Passed</span>
            </div>

            {/* Failed */}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-rose-950 border border-rose-800/80 text-rose-400 flex items-center justify-center text-[10px] font-black">
                X
              </span>
              <span className="text-rose-400">Failed</span>
            </div>

            {/* Not Attempted */}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center text-[10px] font-bold">
                -
              </span>
              <span className="text-slate-300">Not Attempted</span>
            </div>

            {/* Pending */}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-amber-950/80 border border-amber-800/80 text-amber-400 flex items-center justify-center text-[10px] font-bold">
                ?
              </span>
              <span className="text-amber-400">Pending</span>
            </div>

            {/* N/A */}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-slate-950 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                ·
              </span>
              <span className="text-slate-500">N/A</span>
            </div>
          </div>
        </div>

        {/* Hovered Cell Info Banner */}
        {hoveredCell && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs flex items-center justify-between text-slate-300">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-400" />
              <span>
                <strong>Question Q{hoveredCell.k}</strong>, <strong>Challenge C{hoveredCell.j}</strong>:
              </span>
              <span className="font-bold uppercase tracking-wider text-white">
                {hoveredCell.j > hoveredCell.k && (
                  <span className="text-slate-500">N/A (C{hoveredCell.j} is beyond Q{hoveredCell.k})</span>
                )}
                {hoveredCell.j <= hoveredCell.k && matrixData.matrix[hoveredCell.k][hoveredCell.j] === 'passed' && (
                  <span className="text-emerald-400">Passed (✓)</span>
                )}
                {hoveredCell.j <= hoveredCell.k && matrixData.matrix[hoveredCell.k][hoveredCell.j] === 'failed' && (
                  <span className="text-rose-400">Failed / Stopped Point (X)</span>
                )}
                {hoveredCell.j <= hoveredCell.k && matrixData.matrix[hoveredCell.k][hoveredCell.j] === 'not_attempted' && (
                  <span className="text-slate-300">Not Attempted (-)</span>
                )}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              Q{hoveredCell.k} requires challenges C1..C{hoveredCell.k}
            </span>
          </div>
        )}

        {/* Scrollable Matrix Table Container */}
        <div className="relative overflow-auto max-h-[580px] border border-slate-800 rounded-2xl bg-slate-950 shadow-inner custom-scrollbar">
          <table className="w-full border-collapse text-[11px] font-mono text-center">
            {/* Table Sticky Header */}
            <thead className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 shadow-md">
              <tr>
                {/* Frozen top-left header cell */}
                <th className="sticky left-0 z-30 bg-slate-900 border-r border-b border-slate-800 p-2 min-w-[85px] text-slate-300 font-black uppercase text-[11px]">
                  Q \ COMP
                </th>
                {challengeIndices.map((j) => {
                  const summary = matrixData.challengeSummaries.find((s) => s.challengeIndex === j);
                  const isCleared = summary?.isCleared ?? false;
                  return (
                    <th
                      key={j}
                      className={`p-1.5 border-r border-slate-800/80 min-w-[38px] font-extrabold ${
                        isCleared ? 'bg-emerald-950/40 text-emerald-300' : 'text-slate-300'
                      }`}
                      title={`Master Challenge C${j} ${isCleared ? '(Mastered/Cleared)' : '(Pending)'}`}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span>C{j}</span>
                        {isCleared && (
                          <Star className="w-3 h-3 text-emerald-400 fill-emerald-400 inline-block" />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Matrix Body: Q1..Q49 (Filtered by Row Filter) */}
            <tbody>
              {filteredQuestionOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={50}
                    className="p-8 text-center text-slate-500 font-sans font-medium text-xs"
                  >
                    No question rows match the selected filter <strong className="text-slate-300 uppercase">"{rowFilter}"</strong>.
                  </td>
                </tr>
              ) : (
                filteredQuestionOrders.map((k) => {
                  const rowStatus = getRowStatus(k);
                  let statusBadge = null;

                  if (rowStatus === 'mastered') {
                    statusBadge = <span className="text-[9px] font-extrabold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">Mastered</span>;
                  } else if (rowStatus === 'failed') {
                    statusBadge = <span className="text-[9px] font-extrabold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">Failed</span>;
                  } else {
                    statusBadge = <span className="text-[9px] font-extrabold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">Ready</span>;
                  }

                  return (
                    <tr key={k} className="border-b border-slate-800/60 hover:bg-slate-900/60 transition-colors">
                      {/* Sticky Question Header Column */}
                      <td className="sticky left-0 z-10 bg-slate-900 border-r border-slate-800 p-1.5 text-slate-200 font-extrabold text-[11px] shadow-sm flex items-center justify-between gap-1">
                        <span>Q{k}</span>
                        {statusBadge}
                      </td>

                      {/* Challenge Cells C1..C49 */}
                      {challengeIndices.map((j) => {
                        const status = matrixData.matrix[k][j];
                        const isApplicable = j <= k;

                        if (!isApplicable) {
                          return (
                            <td
                              key={j}
                              onMouseEnter={() => setHoveredCell({ k, j })}
                              onMouseLeave={() => setHoveredCell(null)}
                              className="p-1 border-r border-slate-800/40 text-slate-700 bg-slate-950/40 font-mono font-bold select-none cursor-default"
                              title={`C${j} not applicable for Q${k}`}
                            >
                              ·
                            </td>
                          );
                        }

                        let cellClass = 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-700/80 cursor-pointer';
                        let symbol = '-';

                        if (status === 'passed') {
                          cellClass = 'bg-emerald-600/25 text-emerald-400 border-emerald-500/40 hover:bg-emerald-600/35 cursor-pointer font-black';
                          symbol = '✓';
                        } else if (status === 'failed') {
                          cellClass = 'bg-rose-950/80 text-rose-400 border-rose-800/70 hover:bg-rose-900/90 cursor-pointer font-black';
                          symbol = 'X';
                        } else {
                          cellClass = 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-700/80 cursor-pointer';
                          symbol = '-';
                        }

                        return (
                          <td
                            key={j}
                            onMouseEnter={() => setHoveredCell({ k, j })}
                            onMouseLeave={() => setHoveredCell(null)}
                            onClick={() => {
                              setActivePopup({ questionOrder: k, challengeIndex: j });
                            }}
                            className={`p-1 border-r border-slate-800/60 transition-all font-mono font-extrabold text-xs ${cellClass}`}
                            title={`Click to evaluate or adjust Challenge C${j} for Q${k}`}
                          >
                            {symbol}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Sticky Table Footer: MASTERY / COUNTS */}
            <tfoot className="sticky bottom-0 z-20 bg-slate-900 border-t-2 border-slate-700 shadow-2xl">
              {/* Row 1: MASTERY (1 if cleared, 0 if pending) */}
              <tr className="border-b border-slate-800">
                <td className="sticky left-0 z-30 bg-slate-900 border-r border-slate-800 p-2 text-slate-200 font-extrabold text-[10px] text-left uppercase">
                  MASTERY
                </td>
                {challengeIndices.map((j) => {
                  const summary = matrixData.challengeSummaries.find((s) => s.challengeIndex === j);
                  const isCleared = summary?.isCleared ?? false;
                  return (
                    <td
                      key={j}
                      className="p-1 border-r border-slate-800/80 font-mono font-extrabold text-[11px]"
                    >
                      {isCleared ? (
                        <span className="text-emerald-400" title={`C${j} Mastered / Cleared`}>
                          1
                        </span>
                      ) : (
                        <span className="text-slate-600" title={`C${j} Pending Clearance`}>
                          0
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Row 2: COUNTS / PASS ATTEMPT (nP, e.g. 4P, 3P, 2P, 1P, 0P) */}
              <tr>
                <td className="sticky left-0 z-30 bg-slate-900 border-r border-slate-800 p-2 text-slate-300 font-extrabold text-[10px] text-left uppercase">
                  COUNTS
                </td>
                {challengeIndices.map((j) => {
                  const summary = matrixData.challengeSummaries.find((s) => s.challengeIndex === j);
                  const isCleared = summary?.isCleared ?? false;
                  const passAttemptNumber = isCleared
                    ? (summary?.failedCountBeforeClear ?? 0) + 1
                    : 0;

                  return (
                    <td
                      key={j}
                      className={`p-1 border-r border-slate-800/80 font-mono font-extrabold text-[10px] ${
                        isCleared ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                      title={
                        isCleared
                          ? `Passed on attempt #${passAttemptNumber} (${summary?.failedCountBeforeClear} failed repetitions + 1)`
                          : `Challenge C${j} pending clearance`
                      }
                    >
                      {passAttemptNumber}P
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Explanatory Legend Footer */}
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 space-y-2">
          <div className="font-extrabold text-slate-200 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-blue-400" />
            Cumulative Component Matrix Legend & Formulas
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-relaxed">
            <div>
              <p>
                • <strong className="text-blue-400">%CPD (% MSE Challenges Cleared)</strong> = (Total Cleared Challenges ÷ 49) × 100
                = <strong className="text-blue-400">{matrixData.percentCPD.toFixed(1)}%</strong>
              </p>
              <p>
                • <strong>COUNTS (nP)</strong>: Attempt number n on which Challenge C<sub>j</sub> was successfully cleared (n = failed repetitions + 1). Example: 4P = cleared on 4th attempt.
              </p>
            </div>
            <div>
              <p>
                • <strong>ACCN (Average Cumulative Challenge Number)</strong> = Total MCCN ÷ 49 ={' '}
                <strong className="text-amber-400">{matrixData.accn.toFixed(2)}</strong>
              </p>
              <p>
                • <strong>ACT (Average Conscious Time)</strong> = Total MCT ÷ 49 ={' '}
                <strong className="text-indigo-400">{matrixData.actSeconds.toFixed(2)}s</strong>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Challenge Status Popup */}
      {activePopup !== null && (
        <ChallengeStatusPopup
          challengeIndex={activePopup.challengeIndex}
          totalChallengesInQuestion={activePopup.questionOrder}
          onSelectPassed={() => {
            handleApplyChallengeStatus(activePopup.questionOrder, activePopup.challengeIndex, true);
          }}
          onSelectFailed={() => {
            handleApplyChallengeStatus(activePopup.questionOrder, activePopup.challengeIndex, false);
          }}
          onClose={() => setActivePopup(null)}
        />
      )}
    </div>
  );
};
