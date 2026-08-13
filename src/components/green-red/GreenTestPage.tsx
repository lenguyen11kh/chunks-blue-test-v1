import React, { useState, useEffect } from 'react';
import { MOCK_GREEN_RUNS } from '../../data/green-red-data';
import { LearnerAvatar } from '../common/LearnerAvatar';
import { Activity } from 'lucide-react';
import { BlueTestStorageAdapter } from '../../persistence/blue-test-storage';
import { Learner } from '../../types/common';

export const GreenTestPage: React.FC = () => {
  const [learners, setLearners] = useState<Learner[]>(() => BlueTestStorageAdapter.getLearners(false));
  const [selectedLearner, setSelectedLearner] = useState<Learner | null>(() => learners[0] || null);

  useEffect(() => {
    const list = BlueTestStorageAdapter.getLearners(false);
    setLearners(list);
    if (!selectedLearner && list.length > 0) {
      setSelectedLearner(list[0]);
    }
  }, [selectedLearner]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Green Test Header */}
      <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Green Test — 4-Color Assessment</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                Active Baseline
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Standard 4-color manual evaluation with Green probe depth & CPD calculation (CPD = CVR × CCI × score).
            </p>
          </div>
        </div>

        {/* Learner Switcher */}
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <LearnerAvatar learner={selectedLearner} size="sm" />
          <div>
            {learners.length > 0 ? (
              <select
                className="text-xs font-bold text-slate-800 bg-transparent border-none outline-none cursor-pointer"
                value={selectedLearner?.id || ''}
                onChange={(e) => {
                  const l = learners.find((item) => item.id === e.target.value);
                  if (l) setSelectedLearner(l);
                }}
              >
                {learners.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs font-bold text-slate-800">No Learner</p>
            )}
            <p className="text-[10px] text-slate-500">{selectedLearner?.code || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Baseline Green Test Info & Mock Run */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Evaluation System</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">4-Color Scoring</p>
          <div className="mt-4 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <span>Green (Score 3) — Automatic mastery</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span>Yellow (Score 2) — Slight hesitation</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500" />
              <span>Orange (Score 1) — Probe required</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span>Red (Score 0) — Unassisted failure</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">CPD Metric</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">CPD = CVR × CCI × Score</p>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            Measures cognitive performance density. CVR (Cognitive Velocity Rate) and CCI (Cognitive Control Index) weight the 4-color score.
          </p>
          <div className="mt-4 p-3 bg-emerald-50 rounded-xl text-emerald-900 text-xs font-medium">
            Average CPD for {selectedLearner?.name || "No Learner"}: <span className="font-bold">1.85</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Historical Runs</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">{MOCK_GREEN_RUNS.length} Completed</p>
          <div className="mt-4 space-y-2">
            {MOCK_GREEN_RUNS.map((run) => (
              <div key={run.id} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-medium text-slate-700">Run ID: {run.id}</span>
                <span className="text-emerald-700 font-bold">CPD: {run.averageCPD}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
