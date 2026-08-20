import React, { useState, useMemo } from 'react';
import { BlueAssignment, BlueQuestionAttempt } from '../../../types/blue-test';
import { Learner } from '../../../types/common';
import { generateDefaultBluePackage, calculateMaxConsciousTimeRaw } from '../../../domain/blue-test/timing-engine';
import { deriveSevenColor, deriveCaptainReversedSevenColor, getSevenColorDefinition } from '../../../domain/blue-test/color-engine';
import { calculateCaptainDisruptionMetrics } from '../../../domain/blue-test/metrics-engine';
import { BlueTestStorageAdapter } from '../../../persistence/blue-test-storage';
import {
  Anchor,
  BarChart3,
  ChevronLeft,
  Filter,
  ShieldAlert,
  Sparkles,
  Sun,
  Moon,
  Info,
  Sliders,
  TrendingDown,
  Award,
  Clock,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export interface CaptainAnalysisModuleProps {
  assignment: BlueAssignment;
  learner: Learner;
  onBackToTest?: () => void;
}

export type RowFilterOption = 'all' | 'disrupted' | 'non_disrupted' | 'unattempted';

export const CaptainAnalysisModule: React.FC<CaptainAnalysisModuleProps> = ({
  assignment,
  learner,
  onBackToTest,
}) => {
  const pkg = useMemo(() => generateDefaultBluePackage(), []);

  // CoC Inputted Ratio (default 1.2, range 0.1 - 10.0)
  const [coc, setCoc] = useState<number>(1.2);

  // Row Display Filter (All 49, Disrupted n, Non-disrupted 49-n)
  const [rowFilter, setRowFilter] = useState<RowFilterOption>('all');

  // Light/Dark View Toggle
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Retrieve attempt data
  const attempts = useMemo(
    () => BlueTestStorageAdapter.getAttempts(assignment.id),
    [assignment.id]
  );

  // Compute Captain Disruption Metrics using metrics-engine
  const metrics = useMemo(
    () => calculateCaptainDisruptionMetrics(attempts, coc),
    [attempts, coc]
  );

  // Map finalized attempts by globalQuestionOrder for easy row rendering
  const attemptsByOrder = useMemo(() => {
    const map = new Map<number, BlueQuestionAttempt>();
    for (const a of attempts) {
      if (a.finalizedAt) {
        map.set(a.globalQuestionOrder, a);
      }
    }
    return map;
  }, [attempts]);

  // Construct 49 Row items for divergent chart
  const allRows = useMemo(() => {
    return Array.from({ length: 49 }, (_, idx) => {
      const k = idx + 1;
      const sessionNumber = Math.ceil(k / 7);
      const questionInSession = ((k - 1) % 7) + 1;
      const attempt = attemptsByOrder.get(k);

      const isAttempted = Boolean(attempt);
      const tdt = attempt?.maxTimeSecondsRaw ?? calculateMaxConsciousTimeRaw(sessionNumber, questionInSession);
      const mct = attempt ? (attempt.effectiveElapsedSeconds ?? attempt.elapsedSecondsRaw) : tdt;

      // Floating point comparison: Number(mct.toFixed(2)) < Number(tdt.toFixed(2))
      const mctRounded = Number(mct.toFixed(2));
      const tdtRounded = Number(tdt.toFixed(2));
      const isDisrupted = isAttempted && mctRounded < tdtRounded;

      const dt = mct;
      const percentX_i = Math.max(0, Math.min(1, dt / tdt));

      const captainColor = isDisrupted
        ? deriveCaptainReversedSevenColor(dt, tdt)
        : 'red'; // Full Red 100% when non-disrupted

      const crewColor = isDisrupted
        ? deriveSevenColor(dt, tdt)
        : 'purple'; // Full Purple 100% when non-disrupted

      return {
        globalOrder: k,
        sessionNumber,
        questionInSession,
        tdt,
        dt,
        percentX_i,
        isAttempted,
        isDisrupted,
        captainColor,
        crewColor,
      };
    });
  }, [attemptsByOrder]);

  // Filter rows based on user selection
  const filteredRows = useMemo(() => {
    if (rowFilter === 'disrupted') {
      return allRows.filter((r) => r.isAttempted && r.isDisrupted);
    }
    if (rowFilter === 'non_disrupted') {
      return allRows.filter((r) => r.isAttempted && !r.isDisrupted);
    }
    if (rowFilter === 'unattempted') {
      return allRows.filter((r) => !r.isAttempted);
    }
    return allRows;
  }, [allRows, rowFilter]);

  return (
    <div
      className={`min-h-full transition-colors duration-200 p-4 sm:p-6 rounded-2xl border space-y-6 shadow-2xl ${
        isDarkMode
          ? 'bg-slate-950 text-slate-100 border-slate-800'
          : 'bg-slate-50 text-slate-900 border-slate-200'
      }`}
    >
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          {onBackToTest && (
            <button
              onClick={onBackToTest}
              className={`p-2 rounded-xl transition-all ${
                isDarkMode ? 'bg-slate-900 hover:bg-slate-800 text-slate-300' : 'bg-white hover:bg-slate-100 text-slate-700'
              } border ${isDarkMode ? 'border-slate-800' : 'border-slate-300'}`}
              title="Back to Captain Test Room"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 font-extrabold text-xs">⚓ CAPTAIN</span>
              <h1 className="text-xl font-extrabold tracking-tight">Captain Measurement Analysis</h1>
            </div>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Learner: <strong className={isDarkMode ? 'text-slate-200' : 'text-slate-800'}>{learner.name}</strong> ({learner.code})
            </p>
          </div>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              isDarkMode
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
            }`}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-purple-600" />}
            <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </div>

      {/* Progress & Classification Banner */}
      <div
        className={`p-4 rounded-2xl border flex flex-col lg:flex-row items-center justify-between gap-4 ${
          isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold">Captain Test Progress:</span>
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                {metrics.attemptedCount} / 49 questions ({((metrics.attemptedCount / 49) * 100).toFixed(0)}%)
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Clear data breakdown between Stopped, Non-Stopped, and Unattempted questions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs font-bold">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>Stopped: {metrics.n}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/60 border border-purple-500/30 text-purple-300">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            <span>Non-Stopped: {metrics.nonDisruptedAttemptedCount}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
            <span>Unattempted: {metrics.unattemptedCount}</span>
          </div>
        </div>
      </div>

      {/* Top Panel: 5 Primary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: %i (Captain) - Sky Blue #38BDF8 */}
        <div
          className={`p-4 rounded-2xl border flex flex-col justify-between shadow-lg relative overflow-hidden ${
            isDarkMode ? 'bg-slate-900 border-sky-500/30' : 'bg-white border-sky-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-400">1. %i (Captain)</span>
            <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
              <BarChart3 className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-3xl font-black text-sky-400 tracking-tight font-mono">
              {metrics.captainPercentI.toFixed(1)}%
            </div>
            <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              (1 - Avg %x) / CoC
            </p>
          </div>
          <div className="w-full h-1 bg-sky-500/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-400 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, metrics.captainPercentI))}%` }}
            />
          </div>
        </div>

        {/* Card 2: Total %x / 49 - Emerald Green #34D399 */}
        <div
          className={`p-4 rounded-2xl border flex flex-col justify-between shadow-lg relative overflow-hidden ${
            isDarkMode ? 'bg-slate-900 border-emerald-500/30' : 'bg-white border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">2. Total %x / 49</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-3xl font-black text-emerald-400 tracking-tight font-mono">
              {metrics.totalPercentXDisplay.toFixed(1)}%
            </div>
            <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Avg %x across 49 Qs
            </p>
          </div>
          <div className="w-full h-1 bg-emerald-500/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full"
              style={{ width: `${Math.min(100, metrics.totalPercentXDisplay)}%` }}
            />
          </div>
        </div>

        {/* Card 3: %CPD (Captain Stop %) - Cyan Blue #22D3EE */}
        <div
          className={`p-4 rounded-2xl border flex flex-col justify-between shadow-lg relative overflow-hidden ${
            isDarkMode ? 'bg-slate-900 border-cyan-500/30' : 'bg-white border-cyan-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-400">3. %CPD (Captain)</span>
            <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <ShieldAlert className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-3xl font-black text-cyan-400 tracking-tight font-mono">
              {metrics.cpdPercent.toFixed(1)}%
            </div>
            <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {metrics.n} Stopped / {metrics.crewCount} Crew Max
            </p>
          </div>
          <div className="w-full h-1 bg-cyan-500/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 rounded-full"
              style={{ width: `${Math.min(100, metrics.cpdPercent)}%` }}
            />
          </div>
        </div>

        {/* Card 4: Min CT (Fastest) - Purple #C084FC */}
        <div
          className={`p-4 rounded-2xl border flex flex-col justify-between shadow-lg relative overflow-hidden ${
            isDarkMode ? 'bg-slate-900 border-purple-500/30' : 'bg-white border-purple-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-400">4. Min CT (Fastest)</span>
            <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-3xl font-black text-purple-400 tracking-tight font-mono">
              {metrics.n > 0 ? `${metrics.minDt.toFixed(2)}s` : '—'}
            </div>
            <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Fastest Captain Time
            </p>
          </div>
          <div className="w-full h-1 bg-purple-500/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-400 rounded-full"
              style={{ width: metrics.n > 0 ? '100%' : '0%' }}
            />
          </div>
        </div>

        {/* Card 5: CoC (Captain/Crew Ratio) - Emerald Green #34D399 */}
        <div
          className={`p-4 rounded-2xl border flex flex-col justify-between shadow-lg relative overflow-hidden ${
            isDarkMode ? 'bg-slate-900 border-emerald-500/30' : 'bg-white border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">5. CoC Ratio</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Sliders className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2 flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10.0"
              value={coc}
              onChange={(e) => setCoc(Math.max(0.1, Math.min(10, parseFloat(e.target.value) || 1.2)))}
              className={`w-20 px-2 py-1 rounded-lg text-xl font-bold font-mono border focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                isDarkMode ? 'bg-slate-950 text-white border-slate-700' : 'bg-slate-100 text-slate-900 border-slate-300'
              }`}
            />
            <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Ratio</span>
          </div>
          <p className={`text-[10px] font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            CoC = %c*%r (capt) / %c*%r (crew)
          </p>
        </div>
      </div>

      {/* Control Bar: Row Display Filter */}
      <div
        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-wider">Question Display Filter:</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setRowFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              rowFilter === 'all'
                ? 'bg-purple-600 text-white shadow-md'
                : isDarkMode
                ? 'bg-slate-800 text-slate-400 hover:text-white'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            All 49 Questions
          </button>

          <button
            onClick={() => setRowFilter('disrupted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              rowFilter === 'disrupted'
                ? 'bg-cyan-600 text-white shadow-md'
                : isDarkMode
                ? 'bg-slate-800 text-slate-400 hover:text-white'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Stopped ({metrics.n})
          </button>

          <button
            onClick={() => setRowFilter('non_disrupted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              rowFilter === 'non_disrupted'
                ? 'bg-purple-600 text-white shadow-md'
                : isDarkMode
                ? 'bg-slate-800 text-slate-400 hover:text-white'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Non-Stopped ({metrics.nonDisruptedAttemptedCount})
          </button>

          <button
            onClick={() => setRowFilter('unattempted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              rowFilter === 'unattempted'
                ? 'bg-slate-700 text-white shadow-md'
                : isDarkMode
                ? 'bg-slate-800 text-slate-400 hover:text-white'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Unattempted ({metrics.unattemptedCount})
          </button>
        </div>
      </div>

      {/* Center-Axis Divergent Bar Chart */}
      <div
        className={`p-5 rounded-2xl border space-y-4 shadow-xl overflow-hidden ${
          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        {/* Chart Header Labels */}
        <div className="grid grid-cols-12 text-xs font-extrabold uppercase tracking-wider pb-3 border-b border-slate-800">
          <div className="col-span-5 text-right pr-4 text-purple-400">
            👈 Captain Measurement (%x)
          </div>
          <div className="col-span-2 text-center text-slate-400">
            Spine (Q | TDT)
          </div>
          <div className="col-span-5 text-left pl-4 text-emerald-400">
            Crew Observation 👉
          </div>
        </div>

        {/* 49 Symmetric Rows */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {filteredRows.map((row) => {
            const captainColorDef = getSevenColorDefinition(row.captainColor);
            const crewColorDef = getSevenColorDefinition(row.crewColor);

            return (
              <div
                key={row.globalOrder}
                className={`grid grid-cols-12 items-center py-2 px-2.5 rounded-xl border text-xs transition-all ${
                  !row.isAttempted
                    ? isDarkMode
                      ? 'bg-slate-950/30 border-slate-800/50 border-dashed opacity-60'
                      : 'bg-slate-100/50 border-slate-300 border-dashed opacity-70'
                    : isDarkMode
                    ? 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {/* Left Side: Captain Measurement */}
                <div className="col-span-5 flex items-center justify-end gap-2 pr-3">
                  {!row.isAttempted ? (
                    <span className="text-[10px] font-semibold text-slate-500 italic">
                      Unattempted
                    </span>
                  ) : row.isDisrupted ? (
                    <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
                      {row.dt.toFixed(2)}s ({(row.percentX_i * 100).toFixed(0)}%)
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold text-red-400 shrink-0">
                      Non-Stopped (100%)
                    </span>
                  )}

                  <div className="w-full max-w-[200px] h-3.5 bg-slate-800/40 rounded-full overflow-hidden flex justify-end border border-slate-800/50">
                    {!row.isAttempted ? (
                      <div className="w-0 h-full" />
                    ) : (
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: row.isDisrupted ? `${Math.max(5, row.percentX_i * 100)}%` : '100%',
                          backgroundColor: row.isDisrupted ? captainColorDef.hex : '#EF4444',
                        }}
                        title={`Captain %x: ${row.percentX_i * 100}% (${row.captainColor})`}
                      />
                    )}
                  </div>
                </div>

                {/* Center Spine: Minimal Q + TDT Badge */}
                <div className="col-span-2 flex items-center justify-center">
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold font-mono border ${
                      !row.isAttempted
                        ? 'bg-slate-800/40 text-slate-400 border-slate-700/50 border-dashed'
                        : row.isDisrupted
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        : 'bg-red-500/20 text-red-300 border-red-500/30'
                    }`}
                  >
                    Q{row.globalOrder.toString().padStart(2, '0')} | {row.tdt.toFixed(1)}s
                    {!row.isAttempted && <span className="ml-1 text-[9px] text-slate-500 font-normal">(Unattempted)</span>}
                  </span>
                </div>

                {/* Right Side: Crew Observation */}
                <div className="col-span-5 flex items-center justify-start gap-2 pl-3">
                  <div className="w-full max-w-[200px] h-3.5 bg-slate-800/40 rounded-full overflow-hidden flex justify-start border border-slate-800/50">
                    {!row.isAttempted ? (
                      <div className="w-0 h-full" />
                    ) : (
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: !row.isDisrupted ? '100%' : `${Math.max(5, row.percentX_i * 100)}%`,
                          backgroundColor: !row.isDisrupted ? '#A855F7' : crewColorDef.hex,
                        }}
                        title={`Crew Observation: ${row.crewColor}`}
                      />
                    )}
                  </div>

                  {!row.isAttempted ? (
                    <span className="text-[10px] font-semibold text-slate-500 italic">
                      Unattempted
                    </span>
                  ) : !row.isDisrupted ? (
                    <span className="text-[10px] font-mono font-bold text-purple-300 shrink-0">
                      Crew Max (100%)
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
                      {row.dt.toFixed(2)}s ({row.crewColor})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
