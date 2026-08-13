import React, { useState, useEffect } from 'react';
import { MOCK_RED_RUNS } from '../../data/green-red-data';
import { LearnerAvatar } from '../common/LearnerAvatar';
import { FileText, AlertCircle } from 'lucide-react';
import { BlueTestStorageAdapter } from '../../persistence/blue-test-storage';
import { Learner } from '../../types/common';

export const RedTestPage: React.FC = () => {
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
      {/* Red Test Header */}
      <div className="bg-rose-900/10 border border-rose-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-md">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Red Test — Re-Assessment & Probe Workflow</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-rose-100 text-rose-800 rounded-full">
                Active Baseline
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Targeted red-item recovery assessment with deep probe flow and manual 4-color rescoring.
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

      {/* Red Test Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
            <AlertCircle className="w-4 h-4" />
            Red Probe System
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Red test evaluates learner items that previously received Orange or Red scores during initial assessment.
          </p>
          <div className="p-3 bg-rose-50 rounded-xl text-rose-900 text-xs font-medium">
            Active Red Items in Queue: <span className="font-bold">4 Items</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Red Test Results</p>
          <p className="text-2xl font-bold text-slate-900">{MOCK_RED_RUNS.length} Recorded Runs</p>
          <div className="space-y-2 text-xs">
            {MOCK_RED_RUNS.map((run) => (
              <div key={run.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span>Run {run.id}</span>
                <span className="font-bold text-rose-600">CPD: {run.averageCPD}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
