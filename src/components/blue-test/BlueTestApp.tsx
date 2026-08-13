import { TeacherPreferencesService } from '../../persistence/teacher-preferences';
import React, { useState, useEffect } from 'react';
import { Learner } from '../../types/common';

import { AudioSettings, BlueAssignment } from '../../types/blue-test';
import { BlueTestStorageAdapter, initializeBlueTestStorage } from '../../persistence/blue-test-storage';
import { AudioStorageAdapter } from '../../persistence/audio-storage';
import { stopAllAudio } from '../../audio/audio-service';
import { BlueTestSetup, PreferenceSyncStatus, SyncStatusBadge } from './BlueTestSetup';
import { BlueTestRoom } from './BlueTestRoom';
import { BlueTestHistory } from './BlueTestHistory';
import { BlueTestAnalysis } from './BlueTestAnalysis';
import { BlueTestFixtureReview } from './BlueTestFixtureReview';
import { BlueTestAudioManagement } from './BlueTestAudioManagement';
import { Sparkles, Play, BarChart2, FileSpreadsheet, Settings, History, Volume2, ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react';

export type BlueSubView = 'setup' | 'room' | 'history' | 'analysis' | 'fixture_review' | 'audio_management';

const BlueTestAppContent: React.FC = () => {
  const [selectedLearner, setSelectedLearner] = useState<Learner | null>(() => {
    const learners = BlueTestStorageAdapter.getLearners(false);
    return learners[0] || null;
  });
  
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);

  useEffect(() => {
    AudioStorageAdapter.initFromServer().then(() => setIsAudioLoaded(true));
  }, []);

  const [currentSubView, setCurrentSubView] = useState<BlueSubView>('setup');
  const [isNavCollapsed, setIsNavCollapsed] = useState<boolean>(false);

  useEffect(() => {
    if (currentSubView !== 'room') {
      stopAllAudio();
    }
  }, [currentSubView]);

  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => BlueTestStorageAdapter.getAudioSettings());
  const [syncStatus, setSyncStatus] = useState<PreferenceSyncStatus>(null);
  const [syncFeedbackMessage, setSyncFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    TeacherPreferencesService.getPreferences().then(prefs => {
      // Convert TeacherAudioSettings to AudioSettings expected by the app.
      setAudioSettings(prev => ({
        ...prev,
        autoplayTestIntro: prefs.autoplayTestIntro,
        autoplayPackageIntro: prefs.autoplayTestIntro,
        autoplaySessionIntro: prefs.autoplaySessionIntro,
        autoplayQuestionNumber: true,
        autoplayQuestionCue: prefs.autoplayChallengeAudio,
        autoplayPackageEnd: false,
        enableBells: prefs.timerSoundEnabled,
        timerSoundVolume: prefs.timerSoundVolume,
        autoplayChallengeAudio: prefs.autoplayChallengeAudio,
        timerSoundEnabled: prefs.timerSoundEnabled
      }));
      setSyncStatus(prefs.firestoreSynced ? 'synced' : 'local_only');
    }).catch(() => {
      // fallback
      setAudioSettings(BlueTestStorageAdapter.getAudioSettings());
      setSyncStatus('local_only');
    });
  }, []);

  const handleManualSync = async () => {
    setSyncStatus('saving');
    setSyncFeedbackMessage(null);

    const mappedPrefs = {
      autoplayTestIntro: audioSettings.autoplayTestIntro ?? audioSettings.autoplayPackageIntro,
      autoplaySessionIntro: audioSettings.autoplaySessionIntro,
      autoplayChallengeAudio: audioSettings.autoplayChallengeAudio ?? audioSettings.autoplayQuestionCue,
      timerSoundEnabled: audioSettings.timerSoundEnabled ?? audioSettings.enableBells,
      timerSoundVolume: audioSettings.timerSoundVolume ?? 0.5
    };

    const result = await TeacherPreferencesService.syncNow(mappedPrefs);
    setSyncStatus(result.firestoreSynced ? 'synced' : 'local_only');
    setSyncFeedbackMessage(result.message);

    setTimeout(() => {
      setSyncFeedbackMessage(null);
    }, 6000);
  };

  const handleUpdateAudioSettings = (updated: AudioSettings & any) => {
    // optimistic UI & local storage
    setAudioSettings(updated);
    BlueTestStorageAdapter.saveAudioSettings(updated);
    setSyncStatus('saving');
    
    // map back and save to backend
    TeacherPreferencesService.savePreferences({
      autoplayTestIntro: updated.autoplayTestIntro ?? updated.autoplayPackageIntro,
      autoplaySessionIntro: updated.autoplaySessionIntro,
      autoplayChallengeAudio: updated.autoplayChallengeAudio ?? updated.autoplayQuestionCue,
      timerSoundEnabled: updated.timerSoundEnabled ?? updated.enableBells,
      timerSoundVolume: updated.timerSoundVolume ?? 0.5
    }).then(res => {
      setSyncStatus(res.firestoreSynced ? 'synced' : 'local_only');
    }).catch(e => {
      console.warn('Failed to save settings to backend', e);
      setSyncStatus('local_only');
    });
  };

  // Get or create current assignment
  const [assignment, setAssignment] = useState<BlueAssignment | null>(() =>
    selectedLearner ? BlueTestStorageAdapter.createAssignment(selectedLearner.id) : null
  );

  const handleSelectLearner = (learner: Learner) => {
    setSelectedLearner(learner);
    const newAss = BlueTestStorageAdapter.createAssignment(learner.id);
    setAssignment(newAss);
  };

  // Ensure an active learner and assignment are always set
  useEffect(() => {
    const activeLearners = BlueTestStorageAdapter.getLearners(false);
    if (!selectedLearner || !activeLearners.some((l) => l.id === selectedLearner.id)) {
      if (activeLearners.length > 0) {
        handleSelectLearner(activeLearners[0]);
      }
    } else if (!assignment || assignment.learnerId !== selectedLearner.id) {
      const ass = BlueTestStorageAdapter.createAssignment(selectedLearner.id);
      setAssignment(ass);
    }
  }, [selectedLearner, assignment]);

  const handleSelectAssignmentFromHistory = (ass: BlueAssignment, targetView: 'room' | 'analysis') => {
    setAssignment(ass);
    const l = BlueTestStorageAdapter.getLearner(ass.learnerId);
    if (l) {
      setSelectedLearner(l);
    }
    setCurrentSubView(targetView);
  };

  const handleStartTest = (chosenAssignment?: BlueAssignment) => {
    if (chosenAssignment) {
      setAssignment(chosenAssignment);
    } else if (selectedLearner) {
      const active = BlueTestStorageAdapter.getAssignments().find(
        (a) => a.learnerId === selectedLearner.id && a.status !== 'completed'
      );
      if (active) {
        setAssignment(active);
      } else {
        const newAss = BlueTestStorageAdapter.createNewAssignment(selectedLearner.id);
        setAssignment(newAss);
      }
    }
    setCurrentSubView('room');
  };

  const navItems = [
    { id: 'setup' as BlueSubView, label: 'Setup', icon: Settings },
    { id: 'room' as BlueSubView, label: 'Test Room', icon: Play },
    { id: 'history' as BlueSubView, label: 'History', icon: History },
    { id: 'analysis' as BlueSubView, label: '%i Analysis', icon: BarChart2 },
    { id: 'fixture_review' as BlueSubView, label: '49-Row Fixture', icon: FileSpreadsheet },
    { id: 'audio_management' as BlueSubView, label: 'Audio Studio', icon: Volume2 },
  ];



  return (
    <div className="h-full min-h-0 flex flex-row bg-slate-950 text-slate-100 overflow-hidden">
      {/* Left Navigation Sidebar for Blue Test Application */}
      <aside
        className={`shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200 z-30 ${
          isNavCollapsed ? 'w-14 sm:w-16' : 'w-56 sm:w-60'
        }`}
      >
        {/* Nav Header & Toggle */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          {!isNavCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
              <span className="font-extrabold text-xs text-slate-200 uppercase tracking-wider truncate">
                Blue Test
              </span>
            </div>
          )}
          <button
            onClick={() => setIsNavCollapsed(!isNavCollapsed)}
            className={`p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs font-semibold ${
              isNavCollapsed ? 'mx-auto' : 'ml-auto'
            }`}
            title={isNavCollapsed ? 'Expand Navigation' : 'Hide Navigation'}
            aria-label={isNavCollapsed ? 'Expand Navigation' : 'Hide Navigation'}
          >
            {isNavCollapsed ? <ChevronRight className="w-4 h-4 text-blue-400" /> : <ChevronLeft className="w-4 h-4 text-slate-400" />}
          </button>
        </div>

        {/* Active Learner & Preference Sync Status */}
        {!isNavCollapsed && (
          <div className="px-3 py-2 bg-slate-950/40 border-b border-slate-800/80 space-y-1.5 text-[11px] text-slate-400">
            <div>
              Learner: <strong className="text-white font-bold block truncate">{selectedLearner?.name || 'No Learner'}</strong>
            </div>
            <div className="pt-1 border-t border-slate-800/60 flex items-center justify-between gap-1 flex-wrap">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Audio Sync</span>
              <SyncStatusBadge status={syncStatus} isDark onSyncNow={handleManualSync} />
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentSubView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentSubView(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                } ${isNavCollapsed ? 'justify-center px-0' : ''}`}
                title={item.label}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {!isNavCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main SubView Content */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-3 sm:p-5 lg:p-6">
        {currentSubView === 'setup' && (
          <BlueTestSetup
            selectedLearner={selectedLearner}
            onSelectLearner={handleSelectLearner}
            audioSettings={audioSettings}
            onUpdateAudioSettings={handleUpdateAudioSettings}
            syncStatus={syncStatus}
            onSyncNow={handleManualSync}
            syncFeedbackMessage={syncFeedbackMessage}
            onStartTest={handleStartTest}
            onOpenAdminFixture={() => setCurrentSubView('fixture_review')}
            onOpenAudioManagement={() => setCurrentSubView('audio_management')}
          />
        )}

        {currentSubView === 'room' && (
          <BlueTestRoom
            learner={selectedLearner!}
            assignment={assignment!}
            audioSettings={audioSettings}
            onFinishTest={() => setCurrentSubView('analysis')}
            onOpenAnalysis={() => setCurrentSubView('analysis')}
          />
        )}

        {currentSubView === 'history' && (
          <BlueTestHistory onSelectAssignment={handleSelectAssignmentFromHistory} />
        )}

        {currentSubView === 'analysis' && (
          <BlueTestAnalysis
            learner={selectedLearner!}
            assignment={assignment!}
            onBackToRoom={() => setCurrentSubView('room')}
          />
        )}

        {currentSubView === 'fixture_review' && (
          <BlueTestFixtureReview onBackToSetup={() => setCurrentSubView('setup')} />
        )}

        {currentSubView === 'audio_management' && (
          <BlueTestAudioManagement onClose={() => setCurrentSubView('setup')} />
        )}
      </div>
    </div>
  );
};


export const BlueTestApp: React.FC = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    Promise.all([
      AudioStorageAdapter.initFromServer(),
      initializeBlueTestStorage()
    ]).then(() => {
      setIsLoaded(true);
    });
  }, []);
  
  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-slate-400">Loading Cloud Data...</p>
        </div>
      </div>
    );
  }
  
  return <BlueTestAppContent />;
};
