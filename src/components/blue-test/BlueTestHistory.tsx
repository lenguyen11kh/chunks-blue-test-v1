import React, { useState } from 'react';
import { BlueAssignment, BlueTestMode } from '../../types/blue-test';
import { BlueTestStorageAdapter } from '../../persistence/blue-test-storage';
import {
  calculatePercentIMetrics,
  calculateChallengeMatrix,
} from '../../domain/blue-test/metrics-engine';
import { BlueTestChallengeMatrixView } from './BlueTestChallengeMatrixView';
import { LearnerAvatar } from '../common/LearnerAvatar';
import {
  History,
  Search,
  Filter,
  Play,
  BarChart2,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
  FileText,
  Trash2,
  RotateCcw,
  Grid,
  X,
  Maximize2,
  Anchor,
  ShieldAlert,
} from 'lucide-react';

interface BlueTestHistoryProps {
  onSelectAssignment: (
    assignment: BlueAssignment,
    targetView: 'room' | 'analysis' | 'captain_room' | 'captain_analysis'
  ) => void;
}

export const BlueTestHistory: React.FC<BlueTestHistoryProps> = ({ onSelectAssignment }) => {
  const [assignments, setAssignments] = useState<BlueAssignment[]>(() =>
    BlueTestStorageAdapter.getAssignments()
  );
  const learners = BlueTestStorageAdapter.getLearners(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLearnerFilter, setSelectedLearnerFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [selectedModeFilter, setSelectedModeFilter] = useState<string>('all');

  // Deletion modals & Matrix modal state
  const [deletingAssignment, setDeletingAssignment] = useState<BlueAssignment | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState<boolean>(false);
  const [selectedMatrixAssignment, setSelectedMatrixAssignment] = useState<BlueAssignment | null>(null);

  const reloadAssignments = () => {
    setAssignments(BlueTestStorageAdapter.getAssignments());
  };

  const handleDeleteAssignment = () => {
    if (!deletingAssignment) return;
    BlueTestStorageAdapter.deleteAssignment(deletingAssignment.id);
    reloadAssignments();
    setDeletingAssignment(null);
  };

  const handleClearAllHistory = () => {
    BlueTestStorageAdapter.clearAllHistory();
    reloadAssignments();
    setShowClearAllModal(false);
  };

  const learnerMap = new Map();
  learners.forEach((l) => learnerMap.set(l.id, l));

  const filteredAssignments = assignments.filter((ass) => {
    const learner = learnerMap.get(ass.learnerId);
    if (selectedLearnerFilter !== 'all' && ass.learnerId !== selectedLearnerFilter) return false;
    if (selectedStatusFilter !== 'all' && ass.status !== selectedStatusFilter) return false;
    if (selectedModeFilter !== 'all' && (ass.testMode || 'standard') !== selectedModeFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const learnerName = learner?.name.toLowerCase() || '';
      const learnerCode = learner?.code.toLowerCase() || '';
      const assId = ass.id.toLowerCase();
      return learnerName.includes(q) || learnerCode.includes(q) || assId.includes(q);
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 text-slate-900">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600" />
            Blue Test History & Audit Log
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review historical completed or partial Blue Test assignments, manage records, and resume active sessions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {assignments.length > 0 && (
            <button
              onClick={() => setShowClearAllModal(true)}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-all flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear All History
            </button>
          )}

          <div className="flex items-center gap-2 bg-blue-50 text-blue-900 px-3 py-1.5 rounded-xl text-xs font-bold border border-blue-200">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Total Records: {assignments.length}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search learner name, code or ID..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs w-full md:w-auto">
          {/* Learner Filter */}
          <select
            value={selectedLearnerFilter}
            onChange={(e) => setSelectedLearnerFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Learners</option>
            {learners.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>

          {/* Mode Filter */}
          <select
            value={selectedModeFilter}
            onChange={(e) => setSelectedModeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Test Modes</option>
            <option value="standard">🔵 Standard Test Room (%i)</option>
            <option value="captain">⚓ Captain Test Room (CT)</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="in_progress">In Progress / Partial</option>
            <option value="completed">Completed</option>
            <option value="not_started">Not Started</option>
          </select>
        </div>
      </div>

      {/* Assignments Table / List */}
      <div className="space-y-4">
        {filteredAssignments.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-500 text-xs space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700">No test history records match the filter.</p>
            <p>Try clearing search or selecting a different status filter.</p>
          </div>
        ) : (
          filteredAssignments.map((ass) => {
            const learner = learnerMap.get(ass.learnerId) || {
              name: 'Unknown Learner',
              code: 'N/A',
            };
            const attempts = BlueTestStorageAdapter.getAttempts(ass.id);
            const metrics = calculatePercentIMetrics(attempts);
            const matrixData = calculateChallengeMatrix(attempts);

            const isCompleted = ass.status === 'completed';

            return (
              <div
                key={ass.id}
                className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs hover:border-blue-300 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                {/* Learner Info & Status */}
                <div className="flex items-center gap-4">
                  <LearnerAvatar learner={learner} size="md" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">{learner.name}</span>
                      <span className="text-xs text-slate-500 font-mono">({learner.code})</span>

                      {/* Mode Badge */}
                      {ass.testMode === 'captain' ? (
                        <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-extrabold rounded-full flex items-center gap-1 border border-purple-200">
                          <Anchor className="w-3 h-3 text-purple-600" /> Captain Test
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-extrabold rounded-full flex items-center gap-1 border border-blue-200">
                          <Play className="w-3 h-3 text-blue-600 fill-current" /> Standard Test
                        </span>
                      )}

                      {/* Status Badge */}
                      {isCompleted ? (
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Completed
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-extrabold rounded-full flex items-center gap-1">
                          <Clock className="w-3 h-3" /> In Progress ({metrics.finalizedCount}/49)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 font-medium space-x-2">
                      <span>Assigned: {new Date(ass.assignedAt).toLocaleDateString()}</span>
                      <span>• ID: {ass.id}</span>
                      {ass.completedAt && (
                        <span>• Completed: {new Date(ass.completedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metrics Summary & Actions */}
                <div className="flex flex-wrap items-center gap-4 sm:gap-6 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 text-xs">
                  {/* %i Display */}
                  <div
                    className="text-right cursor-help"
                    title="% Requested conscious flow maintained (Total MCT ÷ Total TCT)"
                  >
                    <span className="text-[10px] font-bold text-slate-400 block lowercase">%i</span>
                    <span className="text-lg sm:text-xl font-black text-blue-600 font-mono">
                      {metrics.provisionalPercentI !== null
                        ? `${metrics.provisionalPercentI.toFixed(1)}%`
                        : '—'}
                    </span>
                  </div>

                  {/* %CPD Display */}
                  <div
                    className="text-right cursor-help"
                    title="% MSE challenges ultimately managed (% Challenges Cleared ÷ 49)"
                  >
                    <span className="text-[10px] uppercase font-bold text-purple-600 block">%CPD</span>
                    <span className="text-sm font-black text-purple-700 font-mono">
                      {matrixData.percentCPD.toFixed(1)}%
                    </span>
                  </div>

                  {/* ACCN Display */}
                  <div
                    className="text-right cursor-help"
                    title="Wrong repetitions (MCCN) before successful change (Total MCCN ÷ 49)"
                  >
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">ACCN</span>
                    <span className="text-sm font-black text-amber-600 font-mono">
                      {matrixData.accn.toFixed(2)}
                    </span>
                  </div>

                  {/* Completion Count */}
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Progress</span>
                    <span className="text-sm font-black text-slate-800 font-mono">
                      {metrics.finalizedCount}/49
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Matrix View */}
                    <button
                      onClick={() => setSelectedMatrixAssignment(ass)}
                      className="px-2.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5"
                      title="View 49x49 Challenge Matrix"
                    >
                      <Grid className="w-3.5 h-3.5 text-blue-400" />
                      <span>Matrix</span>
                    </button>

                    {/* Resume Buttons */}
                    {!isCompleted && (
                      ass.testMode === 'captain' ? (
                        <button
                          onClick={() => onSelectAssignment(ass, 'captain_room')}
                          className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                        >
                          <Anchor className="w-3.5 h-3.5" /> Resume Captain
                        </button>
                      ) : (
                        <button
                          onClick={() => onSelectAssignment(ass, 'room')}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> Resume Room
                        </button>
                      )
                    )}

                    {/* Analysis Options */}
                    <button
                      onClick={() => onSelectAssignment(ass, 'analysis')}
                      className="px-2.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold text-xs rounded-xl border border-blue-200 transition-all flex items-center gap-1"
                      title="View Standard %i Analysis"
                    >
                      <BarChart2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>%i Analysis</span>
                    </button>

                    <button
                      onClick={() => onSelectAssignment(ass, 'captain_analysis')}
                      className="px-2.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs rounded-xl border border-purple-200 transition-all flex items-center gap-1"
                      title="View Captain Analysis"
                    >
                      <Anchor className="w-3.5 h-3.5 text-purple-600" />
                      <span>Captain Analysis</span>
                    </button>

                    <button
                      onClick={() => setDeletingAssignment(ass)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all"
                      title="Delete assignment record"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Single Assignment Delete Modal */}
      {deletingAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 text-slate-900 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Delete Assignment Record?</h3>
                <p className="text-xs text-slate-500">ID: {deletingAssignment.id}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              Are you sure you want to delete this test assignment record and all its question attempts?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingAssignment(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAssignment}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Challenge Matrix Modal */}
      {selectedMatrixAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in-50">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0">
                  <Grid className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                    Challenge Matrix Report: {learnerMap.get(selectedMatrixAssignment.learnerId)?.name || 'Learner'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Assignment ID: {selectedMatrixAssignment.id} • Assigned: {new Date(selectedMatrixAssignment.assignedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const ass = selectedMatrixAssignment;
                    setSelectedMatrixAssignment(null);
                    onSelectAssignment(ass, 'analysis');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>Full Analysis</span>
                </button>

                <button
                  onClick={() => setSelectedMatrixAssignment(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all"
                  aria-label="Close matrix modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
              <BlueTestChallengeMatrixView
                attempts={BlueTestStorageAdapter.getAttempts(selectedMatrixAssignment.id)}
                showTopMetrics={true}
                onAttemptUpdated={reloadAssignments}
              />
            </div>
          </div>
        </div>
      )}

      {/* Clear All History Modal */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 text-slate-900 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Clear Entire Test History?</h3>
                <p className="text-xs text-rose-600 font-semibold">Warning: Irreversible action</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              This will erase all historical test assignments, question attempts, and session runs across all learners.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearAllModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllHistory}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
              >
                Clear All History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
