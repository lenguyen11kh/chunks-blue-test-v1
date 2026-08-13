import React, { useState, useEffect } from 'react';
import { Learner } from '../../types/common';
import { BlueTestStorageAdapter, subscribeStorageChanges } from '../../persistence/blue-test-storage';
import { LearnerAvatar } from '../common/LearnerAvatar';
import {
  Users,
  UserPlus,
  Search,
  Edit2,
  Check,
  UserX,
  UserCheck,
  Trash2,
  AlertCircle,
  X,
  ShieldAlert,
  Upload,
} from 'lucide-react';

interface LearnerSetupModuleProps {
  selectedLearner: Learner | null;
  onSelectLearner: (learner: Learner) => void;
}

export const LearnerSetupModule: React.FC<LearnerSetupModuleProps> = ({
  selectedLearner,
  onSelectLearner,
}) => {
  const [learners, setLearners] = useState<Learner[]>(() =>
    BlueTestStorageAdapter.getLearners(true)
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingLearner, setEditingLearner] = useState<Learner | null>(null);
  const [deletingLearner, setDeletingLearner] = useState<Learner | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formGrade, setFormGrade] = useState('');
  const [formAvatarUrl, setFormAvatarUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const reloadLearners = () => {
    const list = BlueTestStorageAdapter.getLearners(true);
    setLearners(list);
  };

  useEffect(() => {
    const unsubscribe = subscribeStorageChanges(() => {
      reloadLearners();
    });
    return unsubscribe;
  }, []);

  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingLearner(null);
    const newCode = `L-${Math.floor(1000 + Math.random() * 9000)}`;
    setFormName('');
    setFormCode(newCode);
    setFormGrade('Grade 3A');
    setFormAvatarUrl(`https://api.dicebear.com/7.x/bottts/svg?seed=${newCode}`);
    setErrorMsg('');
  };

  const handleStartEdit = (learner: Learner, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAdding(false);
    setEditingLearner(learner);
    setFormName(learner.name);
    setFormCode(learner.code);
    setFormGrade(learner.grade || 'Grade 3A');
    setFormAvatarUrl(learner.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${learner.code}`);
    setErrorMsg('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, SVG, WebP)');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setErrorMsg('Dung lượng tệp vượt quá 3MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFormAvatarUrl(reader.result);
        setErrorMsg('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setErrorMsg('Learner name is required');
      return;
    }
    if (!formCode.trim()) {
      setErrorMsg('Learner code is required');
      return;
    }

    // Check duplicate code
    const existing = learners.find(
      (l) => l.code.toLowerCase() === formCode.trim().toLowerCase() && l.id !== editingLearner?.id
    );
    if (existing) {
      setErrorMsg(`Code ${formCode} is already assigned to ${existing.name}`);
      return;
    }

    const learnerToSave: Learner = {
      id: editingLearner ? editingLearner.id : `learner-${Date.now()}`,
      name: formName.trim(),
      code: formCode.trim(),
      grade: formGrade.trim(),
      isActive: editingLearner ? editingLearner.isActive ?? true : true,
      avatarUrl: formAvatarUrl.trim() || `https://api.dicebear.com/7.x/bottts/svg?seed=${formCode.trim()}`,
    };

    const saved = BlueTestStorageAdapter.saveLearner(learnerToSave);
    reloadLearners();

    // If currently selected or just created, select it
    if (!editingLearner || editingLearner.id === selectedLearner?.id) {
      onSelectLearner(saved);
    }

    setIsAdding(false);
    setEditingLearner(null);
  };

  const handleToggleActive = (learner: Learner, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = !learner.isActive;
    const updated = BlueTestStorageAdapter.setLearnerActive(learner.id, newStatus);
    reloadLearners();

    if (learner.id === selectedLearner?.id && updated) {
      onSelectLearner(updated);
    }
  };

  const handleConfirmDeleteLearner = () => {
    if (!deletingLearner) return;
    BlueTestStorageAdapter.deleteLearner(deletingLearner.id);
    reloadLearners();

    const remaining = BlueTestStorageAdapter.getLearners(true);
    if (deletingLearner.id === selectedLearner?.id && remaining.length > 0) {
      onSelectLearner(remaining[0]);
    }
    setDeletingLearner(null);
  };

  const filteredLearners = learners.filter((l) => {
    const q = searchQuery.toLowerCase();
    return l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q);
  });

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">Learner Roster Setup</h2>
        </div>

        <button
          onClick={handleStartAdd}
          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
        >
          <UserPlus className="w-4 h-4" /> Add Learner
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search learner name or code..."
          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Add / Edit Form Drawer */}
      {(isAdding || editingLearner) && (
        <form onSubmit={handleSaveForm} className="bg-slate-100 border-2 border-blue-400 p-4 rounded-2xl space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-black text-slate-900 tracking-wide">
              {isAdding ? '➕ Create New Learner' : `✏️ Edit ${editingLearner?.name}`}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setEditingLearner(null);
              }}
              className="p-1 text-slate-500 hover:text-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-rose-100 border border-rose-300 text-rose-950 text-xs rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-extrabold text-slate-900 uppercase mb-1">
                Learner Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Nguyễn Văn An"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-900 uppercase mb-1">
                Learner Code
              </label>
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g. L-1001"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-900 uppercase mb-1">
                Grade / Class
              </label>
              <input
                type="text"
                value={formGrade}
                onChange={(e) => setFormGrade(e.target.value)}
                placeholder="e.g. Grade 3A"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
          </div>

          {/* Avatar URL & Quick Generator Presets Field */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-300 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-extrabold text-slate-900 uppercase">
                Learner Avatar (Image / Upload)
              </label>
              <label className="cursor-pointer px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Từ Máy Tính</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex items-center gap-3">
              {/* Avatar Live Preview */}
              <div className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-slate-100 border-2 border-blue-600 flex items-center justify-center shadow-sm">
                {formAvatarUrl ? (
                  <img
                    src={formAvatarUrl}
                    alt="Avatar Preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-base font-black text-slate-700">
                    {formName ? formName[0].toUpperCase() : 'A'}
                  </span>
                )}
              </div>

              {/* URL Input */}
              <input
                type="text"
                value={formAvatarUrl}
                onChange={(e) => setFormAvatarUrl(e.target.value)}
                placeholder="Hoặc dán URL hình ảnh / Base64 vào đây..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            {/* Quick Avatar Presets */}
            <div className="flex items-center gap-1.5 pt-1 flex-wrap text-[11px] border-t border-slate-100">
              <span className="text-slate-900 font-black">Avatar Mẫu:</span>
              <button
                type="button"
                onClick={() => setFormAvatarUrl(`https://api.dicebear.com/7.x/bottts/svg?seed=${formCode || formName || 'bot'}`)}
                className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-950 font-extrabold rounded-md border border-blue-300 transition-colors"
              >
                🤖 Bot
              </button>
              <button
                type="button"
                onClick={() => setFormAvatarUrl(`https://api.dicebear.com/7.x/avataaars/svg?seed=${formCode || formName || 'human'}`)}
                className="px-2.5 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-950 font-extrabold rounded-md border border-indigo-300 transition-colors"
              >
                🧑 Person
              </button>
              <button
                type="button"
                onClick={() => setFormAvatarUrl(`https://api.dicebear.com/7.x/thumbs/svg?seed=${formCode || formName || 'thumb'}`)}
                className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-extrabold rounded-md border border-emerald-300 transition-colors"
              >
                👍 Thumb
              </button>
              <button
                type="button"
                onClick={() => setFormAvatarUrl(`https://api.dicebear.com/7.x/fun-emoji/svg?seed=${formCode || formName || 'emoji'}`)}
                className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-950 font-extrabold rounded-md border border-amber-300 transition-colors"
              >
                😊 Emoji
              </button>
              <button
                type="button"
                onClick={() => setFormAvatarUrl(`https://api.dicebear.com/7.x/bottts/svg?seed=rand-${Math.floor(Math.random()*10000)}`)}
                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-900 font-extrabold rounded-md border border-slate-300 transition-colors"
              >
                🎲 Random
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setEditingLearner(null);
              }}
              className="px-3.5 py-1.5 text-xs text-slate-700 hover:text-slate-900 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-xl shadow-md transition-all active:scale-95"
            >
              Save Learner
            </button>
          </div>
        </form>
      )}

      {/* Roster Grid */}
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {filteredLearners.map((learner) => {
          const isSelected = learner.id === selectedLearner.id;
          const isActive = learner.isActive !== false;
          const hasHistory = BlueTestStorageAdapter.hasLearnerHistory(learner.id);

          return (
            <div
              key={learner.id}
              onClick={() => isActive && onSelectLearner(learner)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                isSelected
                  ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20'
                  : isActive
                  ? 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80'
                  : 'bg-slate-100/50 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <LearnerAvatar learner={learner} size="sm" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-900">{learner.name}</span>
                    {isSelected && (
                      <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-extrabold rounded">
                        Selected
                      </span>
                    )}
                    {!isActive && (
                      <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 text-[9px] font-bold rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    {learner.code} • {learner.grade || 'Grade 3A'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => handleStartEdit(learner, e)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-white"
                  title="Edit Learner"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={(e) => handleToggleActive(learner, e)}
                  className={`p-1.5 rounded-lg hover:bg-white ${
                    isActive ? 'text-slate-400 hover:text-amber-600' : 'text-slate-400 hover:text-emerald-600'
                  }`}
                  title={
                    isActive
                      ? hasHistory
                        ? 'Deactivate (Has History)'
                        : 'Deactivate'
                      : 'Reactivate'
                  }
                >
                  {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingLearner(learner);
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white"
                  title="Delete Learner & History"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete Learner Modal */}
      {deletingLearner && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 text-slate-900 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Delete Learner?</h3>
                <p className="text-xs text-slate-500">Learner: {deletingLearner.name} ({deletingLearner.code})</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              Are you sure you want to delete this learner? This action will permanently remove the learner and all associated test attempt records and history.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingLearner(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteLearner}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
