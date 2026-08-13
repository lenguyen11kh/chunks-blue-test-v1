import React, { useState, useEffect } from 'react';
import {
  BlueAssignment,
  BlueQuestionAttempt,
  SevenColor,
} from '../../types/blue-test';
import {
  calculatePercentIMetrics,
  calculateSessionPercentI,
  calculateChallengeMatrix,
} from '../../domain/blue-test/metrics-engine';
import { BlueTestChallengeMatrixView } from './BlueTestChallengeMatrixView';
import { generateDefaultBluePackage } from '../../domain/blue-test/timing-engine';
import {
  SEVEN_COLORS_ORDERED,
  getSevenColorDefinition,
  getEffectiveAttemptValues,
} from '../../domain/blue-test/color-engine';
import { BlueTestStorageAdapter } from '../../persistence/blue-test-storage';
import { Learner } from '../../types/common';
import { LearnerAvatar } from '../common/LearnerAvatar';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LabelList,
} from 'recharts';
import {
  PieChart as PieIcon,
  Clock,
  Sparkles,
  Filter,
  CheckCircle,
  RotateCcw,
  TrendingUp,
  Layers,
  Maximize2,
  Tag,
  X,
  SlidersHorizontal,
  Activity,
  Flame,
} from 'lucide-react';

interface BlueTestAnalysisProps {
  learner: Learner;
  assignment: BlueAssignment;
  onBackToRoom: () => void;
}

const CustomizedQuestionDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={payload.color || '#3B82F6'}
      stroke="#ffffff"
      strokeWidth={1.5}
    />
  );
};

export const BlueTestAnalysis: React.FC<BlueTestAnalysisProps> = ({
  learner,
  assignment,
  onBackToRoom,
}) => {
  const pkg = generateDefaultBluePackage();
  const [attempts, setAttempts] = useState(() => BlueTestStorageAdapter.getAttempts(assignment.id));

  const reloadAttempts = () => {
    setAttempts(BlueTestStorageAdapter.getAttempts(assignment.id));
  };

  const metrics = calculatePercentIMetrics(attempts);
  const matrixData = calculateChallengeMatrix(attempts);
  const rfcValue = metrics.provisionalPercentI !== null ? 100 - metrics.provisionalPercentI : null;
  const actValue = matrixData.actSeconds;

  // Filter state for all charts & table
  const [selectedSessionFilter, setSelectedSessionFilter] = useState<number | 'all'>('all');
  const [selectedColorFilter, setSelectedColorFilter] = useState<SevenColor | 'all'>('all');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState<boolean>(false);

  // Chart controls state
  const [showValues, setShowValues] = useState<Record<number, boolean>>({
    1: false,
    2: false,
    3: false,
    4: false,
  });
  const [activeZoomChart, setActiveZoomChart] = useState<number | null>(null);

  const toggleShowValues = (chartId: number) => {
    setShowValues((prev) => ({ ...prev, [chartId]: !prev[chartId] }));
  };

  const handleResetFilters = () => {
    setSelectedSessionFilter('all');
    setSelectedColorFilter('all');
  };

  const activeFilterCount =
    (selectedSessionFilter !== 'all' ? 1 : 0) + (selectedColorFilter !== 'all' ? 1 : 0);

  // Close Zoom Modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveZoomChart(null);
      }
    };
    if (activeZoomChart !== null) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeZoomChart]);

  // Attempt map
  const attemptMap = new Map<number, BlueQuestionAttempt>();
  attempts.forEach((a) => attemptMap.set(a.globalQuestionOrder, a));

  // Canonical overall averages (unfiltered)
  const finalizedAttempts = attempts.filter((a) => a.finalizedAt);
  const avgElapsed =
    finalizedAttempts.length > 0
      ? finalizedAttempts.reduce((acc, a) => acc + getEffectiveAttemptValues(a).effectiveElapsedSeconds, 0) / finalizedAttempts.length
      : 0;

  const avgRatio =
    finalizedAttempts.length > 0
      ? (finalizedAttempts.reduce((acc, a) => acc + getEffectiveAttemptValues(a).effectiveCompletionRatio, 0) / finalizedAttempts.length) * 100
      : 0;

  // Filtered Questions Dataset (Applies to all 4 charts and table)
  const filteredQuestions = pkg.questions.filter((q) => {
    if (selectedSessionFilter !== 'all' && q.sessionNumber !== selectedSessionFilter) {
      return false;
    }
    if (selectedColorFilter !== 'all') {
      const att = attemptMap.get(q.globalOrder);
      if (!att || att.effectiveColor !== selectedColorFilter) {
        return false;
      }
    }
    return true;
  });

  const isFiltered = selectedSessionFilter !== 'all' || selectedColorFilter !== 'all';

  const filteredFinalizedAttempts = filteredQuestions
    .map((q) => attemptMap.get(q.globalOrder))
    .filter((att): att is BlueQuestionAttempt => !!att && !!att.finalizedAt);

  const filteredAvgElapsed =
    filteredFinalizedAttempts.length > 0
      ? filteredFinalizedAttempts.reduce((acc, a) => acc + getEffectiveAttemptValues(a).effectiveElapsedSeconds, 0) /
        filteredFinalizedAttempts.length
      : 0;

  const filteredColdCount = filteredFinalizedAttempts.filter(
    (att) => !getSevenColorDefinition(att.effectiveColor).isHot
  ).length;

  const filteredPercentI =
    filteredFinalizedAttempts.length > 0
      ? (filteredColdCount / filteredFinalizedAttempts.length) * 100
      : 0;

  // CHART 1 DATA: Finish Time by Question (Filtered)
  const timeByQuestionData = filteredQuestions.map((q) => {
    const att = attemptMap.get(q.globalOrder);
    const colorDef = att ? getSevenColorDefinition(att.effectiveColor) : null;
    const effectiveValues = att && att.finalizedAt ? getEffectiveAttemptValues(att) : null;

    return {
      globalOrder: `Q${q.globalOrder}`,
      qNum: q.globalOrder,
      session: `S${q.sessionNumber}`,
      sessionNum: q.sessionNumber,
      qInSession: q.questionInSession,
      elapsed: effectiveValues ? Number(effectiveValues.effectiveElapsedSeconds.toFixed(2)) : 0,
      observedElapsed: att && att.finalizedAt ? Number(att.elapsedSecondsRaw.toFixed(2)) : 0,
      maxTime: Number(q.maxTimeSecondsRaw.toFixed(2)),
      completionRatio: effectiveValues ? Math.round(effectiveValues.effectiveCompletionRatio * 100) : 0,
      observedCompletionRatio: att && att.finalizedAt ? Math.round(att.completionRatio * 100) : 0,
      color: colorDef ? colorDef.hex : '#94A3B8',
      colorName: colorDef ? colorDef.labelEn : 'Pending',
      mode: att ? att.completionMode : 'Pending',
      isCorrected: att?.completionMode === 'correction',
      isFinalized: !!att?.finalizedAt,
    };
  });

  // CHART 2 DATA: Seven-Color Frequency Distribution (Filtered)
  const sevenColorDistributionData = SEVEN_COLORS_ORDERED.map((def) => {
    const count = filteredFinalizedAttempts.filter(
      (att) => att.effectiveColor === def.color
    ).length;
    return {
      name: `${def.labelEn}`,
      colorKey: def.color,
      count,
      hex: def.hex,
    };
  });

  // CHART 3 DATA: Session Trends (%i & Avg Speed across Sessions in Filtered View)
  const sessionsToInclude =
    selectedSessionFilter !== 'all'
      ? [selectedSessionFilter]
      : [1, 2, 3, 4, 5, 6, 7];

  const sessionBreakdownData = sessionsToInclude.map((sNum) => {
    const sessionQs = filteredQuestions.filter((q) => q.sessionNumber === sNum);
    const sessionAtts = sessionQs
      .map((q) => attemptMap.get(q.globalOrder))
      .filter((att): att is BlueQuestionAttempt => !!att && !!att.finalizedAt);

    const sFinalizedCount = sessionAtts.length;
    const sColdCount = sessionAtts.filter(
      (a) => !getSevenColorDefinition(a.effectiveColor).isHot
    ).length;
    const sPercentI =
      sFinalizedCount > 0 ? (sColdCount / sFinalizedCount) * 100 : 0;
    const sAvgElapsed =
      sFinalizedCount > 0
        ? sessionAtts.reduce((acc, a) => acc + getEffectiveAttemptValues(a).effectiveElapsedSeconds, 0) / sFinalizedCount
        : 0;

    return {
      session: `Session ${sNum}`,
      sessionNum: sNum,
      percentI: Number(sPercentI.toFixed(1)),
      avgElapsed: Number(sAvgElapsed.toFixed(2)),
      finalizedCount: sFinalizedCount,
      totalInSession: sessionQs.length,
    };
  });

  // CHART 4 DATA: Cumulative Time & Provisional %i Progression (Filtered)
  let runningColdCount = 0;
  let runningFinalizedCount = 0;
  let runningCumulativeTime = 0;

  const progressionData = filteredQuestions.map((q) => {
    const qOrder = q.globalOrder;
    const att = attemptMap.get(qOrder);

    if (att && att.finalizedAt) {
      runningFinalizedCount++;
      runningCumulativeTime += getEffectiveAttemptValues(att).effectiveElapsedSeconds;
      const def = getSevenColorDefinition(att.effectiveColor);
      if (!def.isHot) {
        runningColdCount++;
      }
    }

    const runningPercentI =
      runningFinalizedCount > 0
        ? Number(((runningColdCount / runningFinalizedCount) * 100).toFixed(1))
        : 0;

    return {
      qOrder: `Q${qOrder}`,
      qNum: qOrder,
      cumulativeTime: Number(runningCumulativeTime.toFixed(1)),
      provisionalPercentI: runningPercentI,
      finalized: runningFinalizedCount,
    };
  });

  // Render chart content helper for inline & zoom modal
  const renderChart = (chartId: number, isZoomed = false) => {
    const isValuesOn = showValues[chartId];
    const containerHeight = isZoomed ? 'h-[50vh] sm:h-[60vh]' : 'h-64 sm:h-72';

    if (filteredQuestions.length === 0) {
      return (
        <div className={`${containerHeight} w-full flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-2xl border border-slate-200`}>
          <Filter className="w-8 h-8 text-slate-400 mb-2" />
          <p className="font-bold text-slate-700 text-sm">No results match the selected filters.</p>
          <p className="text-xs text-slate-500 mt-1 mb-3">Adjust your session or color filters to view data.</p>
          <button
            onClick={handleResetFilters}
            className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Filters
          </button>
        </div>
      );
    }

    switch (chartId) {
      case 1:
        return (
          <div className={`${containerHeight} w-full pt-2 min-w-0`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeByQuestionData} margin={{ top: 15, right: 15, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="globalOrder" tick={{ fontSize: 10, fill: '#64748B' }} interval={filteredQuestions.length > 20 ? 4 : 0} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} unit="s" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl text-xs space-y-1 shadow-xl border border-slate-800 z-50">
                          <p className="font-bold text-blue-400">
                            {d.globalOrder} ({d.session}, Q{d.qInSession})
                          </p>
                          <p>MCT: <strong className="text-white">{d.elapsed}s</strong> / TCT: {d.maxTime}s</p>
                          <p>Completion Ratio: <strong>{d.completionRatio}%</strong></p>
                          <p>Color: <strong style={{ color: d.color }}>{d.colorName}</strong></p>
                          <p className="text-[10px] text-slate-400">Mode: {d.mode} {d.isCorrected ? '(Corrected)' : ''}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend formatter={(value) => <span className="text-[11px] font-semibold text-slate-700">{value}</span>} />
                <Line
                  type="monotone"
                  dataKey="maxTime"
                  name="TCT (Threshold Conscious Time)"
                  stroke="#CBD5E1"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="elapsed"
                  name="Max Conscious Time (MCT)"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={<CustomizedQuestionDot />}
                  activeDot={{ r: 7, stroke: '#FFFFFF', strokeWidth: 2 }}
                >
                  {isValuesOn && (
                    <LabelList
                      dataKey="elapsed"
                      position="top"
                      offset={8}
                      formatter={(val: any) => (val ? `${Number(val).toFixed(1)}s` : '')}
                      style={{ fontSize: 9, fontWeight: 700, fill: '#1E293B' }}
                    />
                  )}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case 2:
        return (
          <div className={`${containerHeight} w-full flex items-center justify-center min-w-0`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sevenColorDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={isZoomed ? 60 : 45}
                  outerRadius={isZoomed ? 110 : 75}
                  paddingAngle={3}
                  dataKey="count"
                  label={
                    isValuesOn
                      ? ({ count, percent }) =>
                          count > 0 ? `${count} (${(percent * 100).toFixed(0)}%)` : ''
                      : false
                  }
                >
                  {sevenColorDistributionData.map((entry, index) => (
                    <Cell key={`cell-pie-${index}`} fill={entry.hex} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      const totalFinalized = filteredFinalizedAttempts.length;
                      const pct = totalFinalized > 0 ? (d.count / totalFinalized) * 100 : 0;
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs shadow-xl border border-slate-800 z-50">
                          <p className="font-bold" style={{ color: d.hex }}>{d.name}</p>
                          <p>Count: <strong>{d.count}</strong> ({pct.toFixed(1)}%)</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend formatter={(value) => <span className="text-[11px] font-semibold text-slate-700">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );

      case 3:
        return (
          <div className={`${containerHeight} w-full pt-2 min-w-0`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessionBreakdownData} margin={{ top: 15, right: 15, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="session" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} unit="%" domain={[0, 100]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl text-xs space-y-1 shadow-xl border border-slate-800 z-50">
                          <p className="font-bold text-blue-400">{d.session}</p>
                          <p>%i Index: <strong className="text-blue-300">{d.percentI}%</strong></p>
                          <p>Avg MCT: <strong>{d.avgElapsed}s</strong></p>
                          <p>Finalized Questions: {d.finalizedCount}/{d.totalInSession}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="percentI" fill="#2563EB" radius={[6, 6, 0, 0]}>
                  {isValuesOn && (
                    <LabelList
                      dataKey="percentI"
                      position="top"
                      formatter={(val: any) => (val !== undefined ? `${val}%` : '')}
                      style={{ fontSize: 10, fontWeight: 700, fill: '#1E293B' }}
                    />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 4:
        return (
          <div className={`${containerHeight} w-full pt-2 min-w-0`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progressionData} margin={{ top: 15, right: 15, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="qOrder" tick={{ fontSize: 10, fill: '#64748B' }} interval={filteredQuestions.length > 20 ? 4 : 0} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#64748B' }} unit="%" domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#64748B' }} unit="s" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl text-xs space-y-1 shadow-xl border border-slate-800 z-50">
                          <p className="font-bold text-blue-400">{d.qOrder}</p>
                          <p>%i Index: <strong className="text-blue-300">{d.provisionalPercentI}%</strong></p>
                          <p>Cumulative Time: <strong>{d.cumulativeTime}s</strong></p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line yAxisId="left" type="monotone" dataKey="provisionalPercentI" stroke="#2563EB" strokeWidth={2.5} dot={false}>
                  {isValuesOn && (
                    <LabelList
                      dataKey="provisionalPercentI"
                      position="top"
                      formatter={(val: any) => (val !== undefined ? `${val}%` : '')}
                      style={{ fontSize: 9, fontWeight: 700, fill: '#2563EB' }}
                    />
                  )}
                </Line>
                <Line yAxisId="right" type="monotone" dataKey="cumulativeTime" stroke="#64748B" strokeWidth={1.5} strokeDasharray="3 3" dot={false}>
                  {isValuesOn && (
                    <LabelList
                      dataKey="cumulativeTime"
                      position="bottom"
                      formatter={(val: any) => (val !== undefined ? `${val}s` : '')}
                      style={{ fontSize: 9, fontWeight: 700, fill: '#64748B' }}
                    />
                  )}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-900">
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
        <div className="flex items-center gap-4">
          <LearnerAvatar learner={learner} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-white">{learner.name}</h1>
              <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
                Blue Test Workbench
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Learner Code: {learner.code} • Assigned: {new Date(assignment.assignedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <button
          onClick={onBackToRoom}
          className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Return to Test Room
        </button>
      </div>

      {/* Top Metrics Section (4 distinct summary metric cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 1. %i Metric Card */}
        <div
          className="bg-blue-600 border border-blue-500 rounded-3xl p-6 text-white shadow-lg space-y-3 relative overflow-hidden cursor-help"
          title="% Requested conscious flow maintained (Total MCT ÷ Total TCT)"
        >
          <div className="flex items-center justify-between">
            <span
              className="text-sm font-extrabold text-blue-100 uppercase tracking-wide"
              title="% Requested conscious flow maintained (Total MCT ÷ Total TCT)"
            >
              %i Index
            </span>
            <Sparkles className="w-5 h-5 text-blue-200" />
          </div>

          <div className="text-4xl font-black font-mono tracking-tight">
            {metrics.provisionalPercentI !== null
              ? `${metrics.provisionalPercentI.toFixed(1)}%`
              : '—'}
          </div>

          <div className="text-xs text-blue-100 font-medium">
            % Requested conscious flow maintained ({metrics.finalizedCount}/49)
          </div>
        </div>

        {/* 2. ACT Metric Card */}
        <div
          className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-lg space-y-3 relative overflow-hidden cursor-help"
          title="Average conscious time in seconds (Total MCT ÷ 49)"
        >
          <div className="flex items-center justify-between">
            <span
              className="text-sm font-extrabold text-indigo-400 uppercase tracking-wide"
              title="Average conscious time in seconds (Total MCT ÷ 49)"
            >
              ACT
            </span>
            <Activity className="w-5 h-5 text-indigo-400" />
          </div>

          <div className="text-4xl font-black font-mono tracking-tight text-white">
            {matrixData.actSeconds.toFixed(2)}s
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Average conscious time (MCT / 49)
          </div>
        </div>

        {/* 3. %CPD Metric Card (Ocean Blue Theme) */}
        <div
          className="bg-blue-950/60 border border-blue-500/50 rounded-3xl p-6 text-white shadow-lg space-y-3 relative overflow-hidden cursor-help"
          title="% MSE challenges ultimately managed (% Challenges Cleared ÷ 49)"
        >
          <div className="flex items-center justify-between">
            <span
              className="text-sm font-extrabold text-blue-400 uppercase tracking-wide"
              title="% MSE challenges ultimately managed (% Challenges Cleared ÷ 49)"
            >
              %CPD
            </span>
            <CheckCircle className="w-5 h-5 text-blue-400" />
          </div>

          <div className="text-4xl font-black font-mono tracking-tight text-blue-400">
            {matrixData.percentCPD.toFixed(1)}%
          </div>

          <div className="text-xs text-blue-300/80 font-medium">
            % MSE challenges cleared ({matrixData.totalClearedCount}/49)
          </div>
        </div>

        {/* 4. ACCN Metric Card */}
        <div
          className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-lg space-y-3 relative overflow-hidden cursor-help"
          title="Wrong repetitions (MCCN) before successful change (Total MCCN ÷ 49)"
        >
          <div className="flex items-center justify-between">
            <span
              className="text-sm font-extrabold text-amber-400 uppercase tracking-wide"
              title="Wrong repetitions (MCCN) before successful change (Total MCCN ÷ 49)"
            >
              ACCN
            </span>
            <RotateCcw className="w-5 h-5 text-amber-400" />
          </div>

          <div className="text-4xl font-black font-mono tracking-tight text-amber-400">
            {matrixData.accn.toFixed(2)}
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Wrong repetitions before successful change
          </div>
        </div>
      </div>

      {/* ANALYSIS FILTER TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                Analysis Filters
                {activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-blue-600 text-white rounded-full">
                    {activeFilterCount} active
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                Showing <strong className="text-slate-900">{filteredQuestions.length}</strong> of 49 questions
              </p>
            </div>
          </div>

          {/* Desktop / Tablet Filters Row */}
          <div className="hidden md:flex flex-wrap items-center gap-3 text-xs">
            {/* Session Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
              <span className="text-slate-500 font-semibold px-2">Session:</span>
              <select
                value={selectedSessionFilter}
                onChange={(e) =>
                  setSelectedSessionFilter(
                    e.target.value === 'all' ? 'all' : Number(e.target.value)
                  )
                }
                className="px-2.5 py-1 rounded-lg border-0 bg-white font-bold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">All Sessions (1..7)</option>
                {Array.from({ length: 7 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Session {i + 1}
                  </option>
                ))}
              </select>
            </div>

            {/* Color Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
              <span className="text-slate-500 font-semibold px-2">Color:</span>
              <select
                value={selectedColorFilter}
                onChange={(e) =>
                  setSelectedColorFilter(
                    e.target.value === 'all' ? 'all' : (e.target.value as SevenColor)
                  )
                }
                className="px-2.5 py-1 rounded-lg border-0 bg-white font-bold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">All Colors</option>
                {SEVEN_COLORS_ORDERED.map((c) => (
                  <option key={c.color} value={c.color}>
                    {c.labelEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Button */}
            {activeFilterCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                Reset
              </button>
            )}
          </div>

          {/* Mobile Filter Button */}
          <div className="md:hidden flex items-center gap-2 w-full justify-between pt-2 border-t border-slate-100 sm:border-t-0 sm:pt-0">
            <button
              onClick={() => setIsMobileFilterOpen(true)}
              className="px-4 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs flex items-center gap-2 w-full justify-center"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Configure Filters ({activeFilterCount})</span>
            </button>
          </div>
        </div>

        {/* Filtered View Banner */}
        {isFiltered && (
          <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 font-bold text-blue-950">
              <span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[10px] font-black uppercase">
                Filtered View
              </span>
              <span>
                {filteredQuestions.length} of 49 questions ({filteredFinalizedAttempts.length} finalized)
              </span>
            </div>
            <div className="flex items-center gap-4 text-blue-900 font-medium text-xs">
              <span>Avg Speed: <strong className="font-mono">{filteredAvgElapsed.toFixed(2)}s</strong></span>
              <span>Filtered %i: <strong className="font-mono">{filteredFinalizedAttempts.length > 0 ? `${filteredPercentI.toFixed(1)}%` : '—'}</strong></span>
              <button
                onClick={handleResetFilters}
                className="text-blue-700 hover:text-blue-900 underline font-bold"
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Filters Drawer / Sheet */}
      {isMobileFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 space-y-5 animate-in slide-in-from-bottom sm:zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                Filter Blue Test Analysis
              </h3>
              <button
                onClick={() => setIsMobileFilterOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 font-bold"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Session Filter */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Session Filter</label>
                <select
                  value={selectedSessionFilter}
                  onChange={(e) =>
                    setSelectedSessionFilter(
                      e.target.value === 'all' ? 'all' : Number(e.target.value)
                    )
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Sessions (1..7)</option>
                  {Array.from({ length: 7 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      Session {i + 1}
                    </option>
                  ))}
                </select>
              </div>

              {/* Color Filter */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Effective Color Filter</label>
                <select
                  value={selectedColorFilter}
                  onChange={(e) =>
                    setSelectedColorFilter(
                      e.target.value === 'all' ? 'all' : (e.target.value as SevenColor)
                    )
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Colors</option>
                  {SEVEN_COLORS_ORDERED.map((c) => (
                    <option key={c.color} value={c.color}>
                      {c.labelEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleResetFilters}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Reset
              </button>
              <button
                onClick={() => setIsMobileFilterOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4-CHART ANALYSIS SUITE WITH TOOLBARS (SHOW VALUES & ZOOM) */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* CHART 1: Finish Time by Question */}
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs space-y-4 min-w-0">
          <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
                1. Finish Time by Question (Point & Line Chart)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                MCT (Max Conscious Time) (s) per question. Color-coded by derived 7-color band.
              </p>
            </div>

            {/* Chart Toolbar */}
            <div className="flex items-center gap-1 shrink-0 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => toggleShowValues(1)}
                aria-pressed={showValues[1]}
                aria-label={showValues[1] ? 'Hide values' : 'Show values'}
                title={showValues[1] ? 'Hide values' : 'Show values'}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all min-w-[32px] h-[32px] flex items-center justify-center ${
                  showValues[1]
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveZoomChart(1)}
                aria-label="Expand chart"
                title="Expand chart"
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white text-xs font-bold transition-all min-w-[32px] h-[32px] flex items-center justify-center"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {renderChart(1)}
        </div>

        {/* CHART 2: Seven-Color Frequency Distribution */}
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs space-y-4 min-w-0">
          <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-blue-600 shrink-0" />
                2. Seven-Color Frequency Distribution
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Exact count distribution across all 7 conscious timing bands (Red to Purple).
              </p>
            </div>

            {/* Chart Toolbar */}
            <div className="flex items-center gap-1 shrink-0 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => toggleShowValues(2)}
                aria-pressed={showValues[2]}
                aria-label={showValues[2] ? 'Hide values' : 'Show values'}
                title={showValues[2] ? 'Hide values' : 'Show values'}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all min-w-[32px] h-[32px] flex items-center justify-center ${
                  showValues[2]
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveZoomChart(2)}
                aria-label="Expand chart"
                title="Expand chart"
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white text-xs font-bold transition-all min-w-[32px] h-[32px] flex items-center justify-center"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {renderChart(2)}
        </div>

        {/* CHART 3: Session Trends (%i Across Sessions) */}
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs space-y-4 min-w-0">
          <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
                3. Session Trends: %i & Average MCT
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Performance density (%i) and average question speed across Sessions.
              </p>
            </div>

            {/* Chart Toolbar */}
            <div className="flex items-center gap-1 shrink-0 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => toggleShowValues(3)}
                aria-pressed={showValues[3]}
                aria-label={showValues[3] ? 'Hide values' : 'Show values'}
                title={showValues[3] ? 'Hide values' : 'Show values'}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all min-w-[32px] h-[32px] flex items-center justify-center ${
                  showValues[3]
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveZoomChart(3)}
                aria-label="Expand chart"
                title="Expand chart"
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white text-xs font-bold transition-all min-w-[32px] h-[32px] flex items-center justify-center"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {renderChart(3)}
        </div>

        {/* CHART 4: Cumulative Time & %i Progression */}
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs space-y-4 min-w-0">
          <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                4. Cumulative Time & %i Progression
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                %i trajectory and cumulative conscious time across questions.
              </p>
            </div>

            {/* Chart Toolbar */}
            <div className="flex items-center gap-1 shrink-0 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => toggleShowValues(4)}
                aria-pressed={showValues[4]}
                aria-label={showValues[4] ? 'Hide values' : 'Show values'}
                title={showValues[4] ? 'Hide values' : 'Show values'}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all min-w-[32px] h-[32px] flex items-center justify-center ${
                  showValues[4]
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveZoomChart(4)}
                aria-label="Expand chart"
                title="Expand chart"
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white text-xs font-bold transition-all min-w-[32px] h-[32px] flex items-center justify-center"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {renderChart(4)}
        </div>
      </div>

      {/* EXPANDED / ZOOM CHART MODAL */}
      {activeZoomChart !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in-50">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col p-6 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Expanded View: Chart #{activeZoomChart}
                </h3>
                <p className="text-xs text-slate-500">
                  Showing {filteredQuestions.length} of 49 questions • {showValues[activeZoomChart] ? 'Numeric Values Enabled' : 'Values Hidden'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleShowValues(activeZoomChart)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    showValues[activeZoomChart]
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>{showValues[activeZoomChart] ? 'Values On' : 'Show Values'}</span>
                </button>

                <button
                  onClick={() => setActiveZoomChart(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                  aria-label="Close expanded chart"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 w-full overflow-y-auto">
              {renderChart(activeZoomChart, true)}
            </div>
          </div>
        </div>
      )}

      {/* Challenge Matrix 49x49 Grid Table */}
      <BlueTestChallengeMatrixView
        attempts={attempts}
        showTopMetrics={false}
        learnerName={learner.name}
        assignmentId={assignment.id}
        onAttemptUpdated={reloadAttempts}
      />

      {/* Detailed 49-Row Results Table */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            Detailed Question Results Table
            <span className="text-xs font-normal text-slate-500">
              ({filteredQuestions.length} questions matching filters)
            </span>
          </h3>

          {activeFilterCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="p-3">Global Q#</th>
                <th className="p-3">Session</th>
                <th className="p-3" title="Threshold Conscious Time">TCT (s)</th>
                <th className="p-3" title="Observed Max Conscious Time">Observed MCT</th>
                <th className="p-3" title="Effective Max Conscious Time (after correction)">Effective MCT</th>
                <th className="p-3" title="Observed Ratio (Observed MCT / TCT)">Observed Ratio</th>
                <th className="p-3" title="Effective Ratio (Effective MCT / TCT)">Effective Ratio</th>
                <th className="p-3">Derived Color</th>
                <th className="p-3">Effective Color</th>
                <th className="p-3">Mode</th>
                <th className="p-3">Correction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    No results match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredQuestions.map((q) => {
                  const att = attemptMap.get(q.globalOrder);
                  const isFinalized = !!att?.finalizedAt;
                  const derivedDef = att ? getSevenColorDefinition(att.derivedColorAtStop) : null;
                  const effectiveDef = att ? getSevenColorDefinition(att.effectiveColor) : null;
                  const effectiveVals = att && isFinalized ? getEffectiveAttemptValues(att) : null;

                  return (
                    <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-bold font-mono text-slate-800">Q{q.globalOrder}</td>
                      <td className="p-3 text-slate-600">Session {q.sessionNumber}</td>
                      <td className="p-3 font-mono text-slate-700">{q.maxTimeDisplay}</td>
                      <td className="p-3 font-mono text-slate-700">
                        {isFinalized ? `${att.elapsedSecondsRaw.toFixed(2)}s` : '—'}
                      </td>
                      <td className="p-3 font-mono text-blue-700 font-bold">
                        {isFinalized && effectiveVals ? `${effectiveVals.effectiveElapsedSeconds.toFixed(2)}s` : '—'}
                      </td>
                      <td className="p-3 font-mono text-slate-700">
                        {isFinalized ? `${(att.completionRatio * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="p-3 font-mono text-blue-700 font-bold">
                        {isFinalized && effectiveVals ? `${(effectiveVals.effectiveCompletionRatio * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="p-3">
                        {isFinalized && derivedDef ? (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: derivedDef.hex }}
                          >
                            {derivedDef.labelEn}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3">
                        {isFinalized && effectiveDef ? (
                          <span
                            className="px-2.5 py-1 rounded-full text-[10px] font-black text-white shadow-xs"
                            style={{ backgroundColor: effectiveDef.hex }}
                          >
                            {effectiveDef.labelEn}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">Pending</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 text-[11px] font-mono">
                        {isFinalized ? att.completionMode : '—'}
                      </td>
                      <td className="p-3">
                        {att?.completionMode === 'correction' ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-md">
                            Corrected
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
