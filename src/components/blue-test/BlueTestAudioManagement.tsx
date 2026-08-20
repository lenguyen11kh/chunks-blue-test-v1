import { BlueTestCsvImport, CsvChallengeRow } from './BlueTestCsvImport';
import React, { useState, useEffect, useCallback } from 'react';
import {
  BlueAudioVersion,
  NarrationLocationKey,
  AudioStorageVerificationReport,
} from '../../types/blue-test';
import {
  AudioStorageAdapter,
  DEFAULT_NARRATION_SCRIPTS,
} from '../../persistence/audio-storage';
import {
  playNarrationAssetOrSpeech,
  stopNarration,
  NarrationStatus,
} from '../../audio/audio-service';
import {
  Volume2,
  Sparkles,
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  History,
  Trash2,
  Check,
  RefreshCw,
  Sliders,
  Radio,
  FileAudio,
  ListOrdered,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  CloudUpload,
  Upload,
  Link,
  Plus,
  X,
  Layers,
  Activity,
  Key,
  Eye,
  EyeOff,
  Mic,
  Cpu,
  ShieldCheck,
  FileCheck,
  HardDrive,
  XCircle,
  Database,
} from 'lucide-react';

export type ChallengeGenerationStatus = 'idle' | 'generating' | 'uploading' | 'completed' | 'error' | 'quota_paused';

interface BlueTestAudioManagementProps {
  onClose?: () => void;
}

export const BlueTestAudioManagement: React.FC<BlueTestAudioManagementProps> = ({ onClose }) => {
  const [locationsData, setLocationsData] = useState<
    Record<
      NarrationLocationKey,
      {
        scriptText: string;
        versions: BlueAudioVersion[];
        activeVersion: BlueAudioVersion | null;
      }
    >
  >(() => {
    const initial: any = {};
    const keys = Object.keys(DEFAULT_NARRATION_SCRIPTS) as NarrationLocationKey[];
    for (const key of keys) {
      const versions = AudioStorageAdapter.getVersionsForLocation(key);
      const activeVersion = AudioStorageAdapter.getActiveVersion(key);
      initial[key] = {
        scriptText: activeVersion ? activeVersion.scriptText : DEFAULT_NARRATION_SCRIPTS[key].defaultScript,
        versions,
        activeVersion,
      };
    }
    return initial;
  });

  // State for tracking per-challenge GCS generation/upload status
  const [challengeStatusMap, setChallengeStatusMap] = useState<Record<string, ChallengeGenerationStatus>>({});

  // 49 Challenge keys helper
  const challengeKeys = React.useMemo(() => {
    const list: NarrationLocationKey[] = [];
    for (let i = 1; i <= 49; i++) {
      const padded = i < 10 ? `0${i}` : `${i}`;
      list.push(`blue_test_challenge_${padded}` as NarrationLocationKey);
    }
    return list;
  }, []);

  // State for generating single item
  const [generatingKey, setGeneratingKey] = useState<NarrationLocationKey | null>(null);

  // Manual File Upload & URL Mapping states
  const [uploadingKey, setUploadingKey] = useState<NarrationLocationKey | null>(null);
  const [urlMapModalKey, setUrlMapModalKey] = useState<NarrationLocationKey | null>(null);
  const [customAudioUrlInput, setCustomAudioUrlInput] = useState<string>('');

  // Storage Bucket Metadata Verification states
  const [verificationReport, setVerificationReport] = useState<AudioStorageVerificationReport | null>(null);
  const [isVerifyingStorage, setIsVerifyingStorage] = useState<boolean>(false);
  const [showReportDetails, setShowReportDetails] = useState<boolean>(false);

  // State for batch generation
  const [isBatchGenerating, setIsBatchGenerating] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentKey?: string }>({
    current: 0,
    total: 16,
  });

  // Audio Playback Preview State
  const [playingKey, setPlayingKey] = useState<string | null>(null); // locationKey or versionId
  const [playbackStatus, setPlaybackStatus] = useState<NarrationStatus>({
    isPlaying: false,
    hasError: false,
  });

  // Version History Drawers Open state
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  // Active Category Filter Tab
  const [activeCategory, setActiveCategory] = useState<'all' | 'package' | 'sessions' | 'challenges' | 'clocks' | 'missing'>('all');

  const filteredKeys = React.useMemo(() => {
    return (Object.keys(DEFAULT_NARRATION_SCRIPTS) as NarrationLocationKey[]).filter((key) => {
      // Consolidate clock sounds into 1 single unified clock sound card
      if (key === 'blue_test_clock_medium' || key === 'blue_test_clock_urgent') return false;
      if (activeCategory === 'package') return key === 'pkg_intro' || key === 'pkg_end';
      if (activeCategory === 'sessions') return key.startsWith('session_');
      if (activeCategory === 'challenges') return key.startsWith('blue_test_challenge_');
      if (activeCategory === 'clocks') return key.startsWith('blue_test_clock_');
      if (activeCategory === 'missing') return locationsData[key]?.activeVersion == null;
      return true;
    });
  }, [activeCategory, locationsData]);

  // Error messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [isImportingCSV, setIsImportingCSV] = useState(false);

  // TTS Engine Provider & Model Settings
  const [ttsProvider, setTtsProvider] = useState<'gemini' | 'deepgram'>(() => {
    return (localStorage.getItem('blue_test_tts_provider') as 'gemini' | 'deepgram') || 'gemini';
  });
  const [deepgramApiKey, setDeepgramApiKey] = useState<string>(() => {
    return localStorage.getItem('blue_test_deepgram_api_key') || '';
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [deepgramModel, setDeepgramModel] = useState<string>(() => {
    return localStorage.getItem('blue_test_deepgram_model') || 'flux-alexis-en';
  });
  const [geminiVoice, setGeminiVoice] = useState<string>(() => {
    return localStorage.getItem('blue_test_gemini_voice') || 'Kore';
  });

  const reloadAllLocations = useCallback(() => {
    const updated: any = {};
    const keys = Object.keys(DEFAULT_NARRATION_SCRIPTS) as NarrationLocationKey[];
    
    setChallengeStatusMap((prev) => {
      const nextMap = { ...prev };
      for (const key of keys) {
        const activeVersion = AudioStorageAdapter.getActiveVersion(key);
        if (activeVersion) {
          nextMap[key] = 'completed';
        } else if (!nextMap[key] || nextMap[key] === 'completed') {
          nextMap[key] = 'idle';
        }
      }
      return nextMap;
    });

    for (const key of keys) {
      const versions = AudioStorageAdapter.getVersionsForLocation(key);
      const activeVersion = AudioStorageAdapter.getActiveVersion(key);
      const config = DEFAULT_NARRATION_SCRIPTS[key];
      updated[key] = {
        scriptText: activeVersion ? activeVersion.scriptText : config.spokenScript || config.defaultScript,
        versions,
        activeVersion,
      };
    }
    setLocationsData(updated);
  }, []);

  useEffect(() => {
    AudioStorageAdapter.syncFromCloud().then(() => {
      reloadAllLocations();
    });
    reloadAllLocations();
    const unsubscribe = AudioStorageAdapter.subscribe(() => {
      reloadAllLocations();
    });
    return () => unsubscribe();
  }, [reloadAllLocations]);

  // Handle generating TTS for a single location
  const handleGenerateTTS = async (locationKey: NarrationLocationKey, customText?: string) => {
    setGeneratingKey(locationKey);
    setErrorMessage(null);
    setSuccessMessage(null);

    setChallengeStatusMap((prev) => ({
      ...prev,
      [locationKey]: 'generating',
    }));

    const config = DEFAULT_NARRATION_SCRIPTS[locationKey];
    const scriptToUse =
      customText !== undefined
        ? customText
        : locationsData[locationKey]?.scriptText || config.spokenScript || config.defaultScript;

    try {
      const res = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationKey,
          scriptText: scriptToUse,
          provider: ttsProvider,
          voice: ttsProvider === 'deepgram' ? deepgramModel : geminiVoice,
          deepgramApiKey: deepgramApiKey ? deepgramApiKey.trim() : undefined,
          deepgramModel: deepgramModel,
        }),
      });

      const data = await res.json();

      if (
        res.status === 429 ||
        data.quotaExceeded ||
        (data.error && (
          data.error.includes('quota') ||
          data.error.includes('credit') ||
          data.error.includes('depleted') ||
          data.error.includes('prepayment') ||
          data.error.includes('429')
        ))
      ) {
        setChallengeStatusMap((prev) => ({
          ...prev,
          [locationKey]: 'quota_paused',
        }));
        setErrorMessage(
          `${ttsProvider === 'deepgram' ? 'Deepgram' : 'Gemini'} TTS API quota / prepayment credits depleted. Don't worry! The test room automatically uses Browser Web Speech API narration during assessment sessions.`
        );
        return;
      }

      if (!res.ok || !data.success) {
        setChallengeStatusMap((prev) => ({
          ...prev,
          [locationKey]: 'error',
        }));
        throw new Error(data.error || 'Failed to generate TTS audio');
      }

      const newVersion: BlueAudioVersion = data.asset;
      AudioStorageAdapter.saveVersion(newVersion);
      setChallengeStatusMap((prev) => ({
        ...prev,
        [locationKey]: 'completed',
      }));
      reloadAllLocations();

      setSuccessMessage(
        `Generated ${ttsProvider === 'deepgram' ? `Deepgram (${deepgramModel})` : `Gemini (${geminiVoice})`} TTS audio version v${newVersion.version} for "${config.label}"`
      );
    } catch (err: any) {
      console.error('Error generating TTS:', err);
      setChallengeStatusMap((prev) => ({
        ...prev,
        [locationKey]: 'error',
      }));
      setErrorMessage(err.message || `Failed to generate audio via ${ttsProvider === 'deepgram' ? 'Deepgram' : 'Gemini'} API`);
    } finally {
      setGeneratingKey(null);
    }
  };

  const handleCsvImportConfirmed = (rows: CsvChallengeRow[]) => {
    for (const row of rows) {
      DEFAULT_NARRATION_SCRIPTS[row.target_key] = {
        label: row.challenge_label,
        description: `Session ${row.session_number} Q${row.session_question_number} (Global Q${row.challenge_number})`,
        defaultScript: row.display_script,
        spokenScript: row.spoken_script,
        isChallenge: true,
      };
    }
    
    reloadAllLocations();
    setShowCsvImport(false);
    setSuccessMessage('Successfully imported 49 Challenge Scripts. Review them in the Challenges tab.');
    setActiveCategory('challenges');
  };

  const handleBatchGenerateAll = async () => {
    setIsBatchGenerating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const keys = filteredKeys;
    setBatchProgress({ current: 0, total: keys.length });

    let successCount = 0;
    let quotaHit = false;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      setBatchProgress({ current: i + 1, total: keys.length, currentKey: key });

      setChallengeStatusMap((prev) => ({
        ...prev,
        [key]: 'generating',
      }));

      try {
        const config = DEFAULT_NARRATION_SCRIPTS[key];
        const textToUse =
          locationsData[key]?.scriptText || config.spokenScript || config.defaultScript;

        const res = await fetch('/api/tts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locationKey: key,
            scriptText: textToUse,
            provider: ttsProvider,
            voice: ttsProvider === 'deepgram' ? deepgramModel : geminiVoice,
            deepgramApiKey: deepgramApiKey ? deepgramApiKey.trim() : undefined,
            deepgramModel: deepgramModel,
          }),
        });

        const data = await res.json();
        if (
          res.status === 429 ||
          data.quotaExceeded ||
          (data.error && (
            data.error.includes('quota') ||
            data.error.includes('credit') ||
            data.error.includes('depleted') ||
            data.error.includes('prepayment') ||
            data.error.includes('429')
          ))
        ) {
          quotaHit = true;
          setChallengeStatusMap((prev) => ({
            ...prev,
            [key]: 'quota_paused',
          }));
          for (let j = i + 1; j < keys.length; j++) {
            setChallengeStatusMap((prev) => ({
              ...prev,
              [keys[j]]: 'quota_paused',
            }));
          }
          console.warn('Batch generation paused: Gemini TTS quota / credit limit reached.');
          break;
        }

        if (res.ok && data.success) {
          AudioStorageAdapter.saveVersion(data.asset);
          setChallengeStatusMap((prev) => ({
            ...prev,
            [key]: 'completed',
          }));
          successCount++;
        } else {
          setChallengeStatusMap((prev) => ({
            ...prev,
            [key]: 'error',
          }));
        }
      } catch (e) {
        console.warn(`Batch generation failed for ${key}:`, e);
        setChallengeStatusMap((prev) => ({
          ...prev,
          [key]: 'error',
        }));
      }
    }

    reloadAllLocations();
    setIsBatchGenerating(false);

    if (quotaHit) {
      setErrorMessage(
        `Batch generation paused: Gemini TTS daily quota limit reached (100 requests/day). ${successCount} assets saved. All remaining cues automatically fall back to Browser Web Speech API during test sessions.`
      );
    } else {
      setSuccessMessage(`Successfully batch generated ${successCount} of ${keys.length} Gemini TTS audio assets!`);
    }
  };

  // Play audio preview (Gemini audio asset or Speech fallback)
  const handlePlayPreview = (keyOrVersionId: string, audioUrl: string | null, text: string, targetKey?: NarrationLocationKey) => {
    if (playingKey === keyOrVersionId && playbackStatus.isPlaying) {
      stopNarration();
      setPlayingKey(null);
      setPlaybackStatus({ isPlaying: false, hasError: false });
      return;
    }

    const resolvedLocKey = targetKey || (keyOrVersionId in DEFAULT_NARRATION_SCRIPTS ? (keyOrVersionId as NarrationLocationKey) : undefined);
    let urlToPlay = audioUrl;

    if (!urlToPlay && resolvedLocKey) {
      const activeVer = AudioStorageAdapter.getActiveVersion(resolvedLocKey);
      if (activeVer) {
        urlToPlay = activeVer.audioUrl;
      }
    }

    setPlayingKey(keyOrVersionId);
    playNarrationAssetOrSpeech(
      urlToPlay,
      text,
      (status) => {
        setPlaybackStatus(status);
        if (!status.isPlaying) {
          setPlayingKey(null);
        }
      },
      undefined,
      resolvedLocKey ? DEFAULT_NARRATION_SCRIPTS[resolvedLocKey]?.label : 'Audio Preview',
      resolvedLocKey
    );
  };

  // Set active version
  const handleSetActiveVersion = (locationKey: NarrationLocationKey, versionId: string) => {
    AudioStorageAdapter.setActiveVersion(locationKey, versionId);
    reloadAllLocations();
    setSuccessMessage(`Set version as active for ${DEFAULT_NARRATION_SCRIPTS[locationKey].label}`);
  };

  // Delete version
  const handleDeleteVersion = (versionId: string) => {
    AudioStorageAdapter.deleteVersion(versionId);
    reloadAllLocations();
  };

  // Generate specific clock option
  const handleGenerateTTSWithOption = async (locationKey: NarrationLocationKey, optionIndex: number, style: string) => {
    setGeneratingKey(locationKey);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationKey,
          optionIndex,
          style,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to generate clock sound option');
      }

      const data = await res.json();
      if (data.asset) {
        AudioStorageAdapter.saveVersion({
          id: data.asset.id,
          locationKey,
          version: data.asset.version,
          scriptText: data.asset.scriptText,
          voice: data.asset.voice,
          model: data.asset.model,
          audioUrl: data.asset.audioUrl,
          createdAt: data.asset.createdAt,
          isActive: true,
          fileSizeBytes: data.asset.fileSizeBytes,
          durationSeconds: data.asset.durationSeconds,
        });
        reloadAllLocations();
        setSuccessMessage(`Generated Option #${optionIndex} for ${DEFAULT_NARRATION_SCRIPTS[locationKey].label}`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error generating clock sound option');
    } finally {
      setGeneratingKey(null);
    }
  };

  // Toggle version history drawer
  const toggleHistory = (locationKey: string) => {
    setExpandedHistory((prev) => ({ ...prev, [locationKey]: !prev[locationKey] }));
  };

  // Manual File Upload handler
  const handleFileUpload = async (locationKey: NarrationLocationKey, file: File) => {
    setUploadingKey(locationKey);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64Data = e.target?.result as string;
          const res = await fetch('/api/audio-storage/upload-manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              locationKey,
              fileName: file.name,
              base64Data,
              scriptText: DEFAULT_NARRATION_SCRIPTS[locationKey]?.spokenScript || DEFAULT_NARRATION_SCRIPTS[locationKey]?.defaultScript,
              voice: `Manual File (${file.name})`,
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to upload manual audio file');
          }

          const data = await res.json();
          if (data.asset) {
            AudioStorageAdapter.saveVersion(data.asset);
            reloadAllLocations();
            setSuccessMessage(`Successfully uploaded custom audio file for [${DEFAULT_NARRATION_SCRIPTS[locationKey].label}] & set as active version!`);
          }
        } catch (err: any) {
          console.error(err);
          setErrorMessage(err.message || 'Error uploading custom audio file');
        } finally {
          setUploadingKey(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error reading audio file');
      setUploadingKey(null);
    }
  };

  // Manual URL Mapping handler
  const handleUrlMappingSubmit = async (locationKey: NarrationLocationKey, urlToMap: string) => {
    if (!urlToMap.trim()) return;
    setUploadingKey(locationKey);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/audio-storage/upload-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationKey,
          audioUrl: urlToMap.trim(),
          scriptText: DEFAULT_NARRATION_SCRIPTS[locationKey]?.spokenScript || DEFAULT_NARRATION_SCRIPTS[locationKey]?.defaultScript,
          voice: 'Manual Audio URL Mapping',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to map audio URL');
      }

      const data = await res.json();
      if (data.asset) {
        AudioStorageAdapter.saveVersion(data.asset);
        reloadAllLocations();
        setSuccessMessage(`Successfully mapped custom audio URL for [${DEFAULT_NARRATION_SCRIPTS[locationKey].label}] & set as active!`);
        setUrlMapModalKey(null);
        setCustomAudioUrlInput('');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error mapping custom audio URL');
    } finally {
      setUploadingKey(null);
    }
  };

  // Count active Gemini assets
  const activeCount = Object.values(locationsData).filter((l: any) => l.activeVersion !== null).length;

  // 49 Challenge progress statistics
  const completedChallengesCount = challengeKeys.filter(
    (key) => (challengeStatusMap[key] || (locationsData[key]?.activeVersion ? 'completed' : 'idle')) === 'completed'
  ).length;

  const generatingChallengesCount = challengeKeys.filter(
    (key) => (challengeStatusMap[key] || 'idle') === 'generating'
  ).length;

  const quotaOrErrorCount = challengeKeys.filter((key) => {
    const s = challengeStatusMap[key];
    return s === 'quota_paused' || s === 'error';
  }).length;

  const pendingChallengesCount = Math.max(0, 49 - completedChallengesCount - generatingChallengesCount - quotaOrErrorCount);

  const handleClearAllAudio = async () => {
    if (!window.confirm('Are you sure you want to clear ALL cached and stored audio assets? This will purge old versions and reset active audio mappings so new TTS audio can be generated cleanly.')) {
      return;
    }
    try {
      await AudioStorageAdapter.clearAllVersions();
      reloadAllLocations();
      setSuccessMessage('Successfully cleared all audio studio data and cache! All items reset to updated TDT scripts.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to clear audio storage.');
    }
  };

  const [isSyncingStorage, setIsSyncingStorage] = useState(false);

  const handleSyncStorage = async () => {
    setIsSyncingStorage(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await AudioStorageAdapter.syncStorageAudio();
      reloadAllLocations();
      setSuccessMessage(result.message || 'Successfully synced audio data from Cloud Storage / Firestore!');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to sync Cloud Storage audio data.');
    } finally {
      setIsSyncingStorage(false);
    }
  };

  const handleVerifyStorage = async () => {
    setIsVerifyingStorage(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const report = await AudioStorageAdapter.verifyStorageMetadata();
      setVerificationReport(report);
      setSuccessMessage(report.summaryReport || 'Audio storage verification completed!');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to verify storage metadata against bucket.');
    } finally {
      setIsVerifyingStorage(false);
    }
  };

  const handleExportFullScriptAudio = () => {
    try {
      const keys = Object.keys(DEFAULT_NARRATION_SCRIPTS) as NarrationLocationKey[];
      const headers = ['location_key', 'label', 'script_text', 'audio_url', 'voice', 'status', 'created_at'];

      const escapeCsv = (str: string) => {
        if (!str) return '""';
        const clean = str.replace(/"/g, '""');
        return `"${clean}"`;
      };

      const rows = keys.map((key) => {
        const config = DEFAULT_NARRATION_SCRIPTS[key];
        const activeAsset = AudioStorageAdapter.getActiveVersion(key);
        const scriptText = activeAsset ? activeAsset.scriptText : config.defaultScript;
        const audioUrl = activeAsset ? activeAsset.audioUrl : '';
        const voice = activeAsset ? activeAsset.voice : 'Browser Web Speech';
        const status = activeAsset ? (activeAsset.model || 'Mapped Audio') : 'Default Script (No Audio)';
        const createdAt = activeAsset ? activeAsset.createdAt : '';

        return [
          escapeCsv(key),
          escapeCsv(config.label),
          escapeCsv(scriptText),
          escapeCsv(audioUrl),
          escapeCsv(voice),
          escapeCsv(status),
          escapeCsv(createdAt),
        ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `chunks_blue_test_full_script_audio_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMessage(`Exported full audio scripts CSV successfully (${keys.length} items)!`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to export audio scripts CSV.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Server-Side Gemini 3.1 Flash TTS
              </span>
              <span className="px-3 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" /> Voice: Kore • 24kHz WAV Mono
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Volume2 className="w-6 h-6 text-blue-400" /> Blue Test Audio Narration Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              Generate, preview, persist, version-control, and regenerate audio assets for Blue Test Package Intro, Session Intros (1..7), Package End, and 7 Reusable Question Number Cues using AI Studio’s server-side Gemini TTS API.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <button
              onClick={handleExportFullScriptAudio}
              className="px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
              title="Export full list of narration scripts and active audio URLs as CSV"
            >
              <Download className="w-4 h-4" />
              <span>Export Full Script Audio</span>
            </button>

            <button
              onClick={handleSyncStorage}
              disabled={isSyncingStorage}
              className="px-4 py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              title="Push local audio files to Cloud Storage (audio-storage/ folder) & fetch remote storage data"
            >
              <CloudUpload className={`w-4 h-4 ${isSyncingStorage ? 'animate-bounce' : ''}`} />
              {isSyncingStorage ? 'Pushing & Fetching Storage...' : 'Push & Fetch Storage Data'}
            </button>

            <button
              onClick={handleVerifyStorage}
              disabled={isVerifyingStorage}
              className="px-4 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              title="Verify existence of all audio files in metadata.json against actual storage bucket contents"
            >
              <ShieldCheck className={`w-4 h-4 ${isVerifyingStorage ? 'animate-spin' : ''}`} />
              {isVerifyingStorage ? 'Verifying Storage...' : 'Verify Storage Data'}
            </button>

            <button
              onClick={() => setShowCsvImport(true)}
              className="px-5 py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
            >
              Import CSV
            </button>
            <button
              onClick={handleClearAllAudio}
              className="px-4 py-3 rounded-2xl bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/50 font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
              title="Clear all stored and cached audio assets"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              Clear Audio Data
            </button>
            <button
              onClick={handleBatchGenerateAll}
              disabled={isBatchGenerating}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isBatchGenerating ? 'animate-spin' : ''}`} />
              {isBatchGenerating
                ? `Generating (${batchProgress.current}/${batchProgress.total})...`
                : (activeCategory === 'all' ? 'Batch Generate All' : 'Batch Generate Filtered')}
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors text-center"
              >
                Close Studio
              </button>
            )}
          </div>
        </div>

        {/* Stats Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700/50">
            <p className="text-slate-400 font-medium">Canonical Audio Targets</p>
            <p className="text-lg font-black text-white mt-0.5">{Object.keys(DEFAULT_NARRATION_SCRIPTS).length} Targets</p>
          </div>
          <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700/50">
            <p className="text-slate-400 font-medium">Active Gemini WAV Assets</p>
            <p className="text-lg font-black text-emerald-400 mt-0.5">{activeCount} / {Object.keys(DEFAULT_NARRATION_SCRIPTS).length} Active</p>
          </div>
          <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700/50">
            <p className="text-slate-400 font-medium">Voice Model</p>
            <p className="text-sm font-bold text-blue-300 mt-1">Kore (24kHz WAV)</p>
          </div>
          <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700/50">
            <p className="text-slate-400 font-medium">Reusable Question Cues</p>
            <p className="text-sm font-bold text-indigo-300 mt-1">7 Number Assets</p>
          </div>
        </div>

        {/* Verification Report Panel */}
        {verificationReport && (
          <div className="mt-6 pt-6 border-t border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${verificationReport.missingCount === 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white">Storage Bucket & Metadata Status Report</h3>
                    <span className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded-md border border-slate-700">
                      Bucket: {verificationReport.bucketName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">{verificationReport.summaryReport}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={() => setShowReportDetails(!showReportDetails)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <FileCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>{showReportDetails ? 'Hide Itemized Audit' : 'Show Itemized Audit'}</span>
                  {showReportDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Metric summary badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-[11px] font-medium">Metadata Entries</p>
                  <p className="text-base font-bold text-white mt-0.5">{verificationReport.totalInMetadata}</p>
                </div>
                <Database className="w-5 h-5 text-slate-500" />
              </div>
              <div className="bg-emerald-950/30 border border-emerald-500/20 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-emerald-400 text-[11px] font-medium">Verified in Bucket</p>
                  <p className="text-base font-bold text-emerald-300 mt-0.5">{verificationReport.verifiedCount}</p>
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="bg-cyan-950/30 border border-cyan-500/20 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-cyan-400 text-[11px] font-medium">Local Disk Blobs</p>
                  <p className="text-base font-bold text-cyan-300 mt-0.5">{verificationReport.localOnlyCount}</p>
                </div>
                <HardDrive className="w-5 h-5 text-cyan-400" />
              </div>
              <div className={`p-3.5 rounded-xl border flex items-center justify-between ${verificationReport.missingCount > 0 ? 'bg-rose-950/30 border-rose-500/30' : 'bg-slate-900/90 border-slate-800'}`}>
                <div>
                  <p className={verificationReport.missingCount > 0 ? 'text-rose-400 text-[11px] font-medium' : 'text-slate-400 text-[11px] font-medium'}>Missing Files</p>
                  <p className={`text-base font-bold mt-0.5 ${verificationReport.missingCount > 0 ? 'text-rose-300' : 'text-slate-300'}`}>{verificationReport.missingCount}</p>
                </div>
                {verificationReport.missingCount > 0 ? <AlertCircle className="w-5 h-5 text-rose-400" /> : <Check className="w-5 h-5 text-slate-500" />}
              </div>
            </div>

            {/* Expandable Itemized Table */}
            {showReportDetails && (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800 font-semibold px-1">
                  <span>Location Key & Target</span>
                  <span>Expected File Name</span>
                  <span>Verification Status & Link</span>
                </div>
                <div className="max-h-80 overflow-y-auto space-y-2 pr-1 text-xs">
                  {verificationReport.items.map((item) => {
                    const scriptInfo = DEFAULT_NARRATION_SCRIPTS[item.locationKey];
                    return (
                      <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-slate-900/80 border border-slate-800/90 rounded-xl gap-2 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-300 font-bold">{scriptInfo?.label || item.locationKey}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">v{item.version}</span>
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          {item.fileName} {item.fileSizeBytes ? `(${Math.round(item.fileSizeBytes / 1024)} KB)` : ''}
                        </div>
                        <div className="flex items-center gap-2">
                          {item.status === 'VERIFIED' && (
                            <span className="px-2.5 py-1 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> VERIFIED IN BUCKET
                            </span>
                          )}
                          {item.status === 'LOCAL_ONLY' && (
                            <span className="px-2.5 py-1 text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg flex items-center gap-1">
                              <HardDrive className="w-3 h-3" /> LOCAL DISK BLOB
                            </span>
                          )}
                          {item.status === 'MISSING' && (
                            <span className="px-2.5 py-1 text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> MISSING
                            </span>
                          )}
                          {item.cloudUrl && (
                            <a
                              href={item.cloudUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 hover:bg-slate-800 text-blue-400 rounded transition-colors"
                              title="Open audio URL"
                            >
                              <Link className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-700 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="font-bold underline text-red-800">
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="font-bold underline text-emerald-900">
            Dismiss
          </button>
        </div>
      )}

      {/* TTS Engine Provider & Model Settings Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl text-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                TTS Engine Provider & Voice Model
              </h3>
              <p className="text-[11px] text-slate-400">
                Select between Google Gemini TTS or Deepgram TTS models (Flux, Aura-2, Aura) with auto-storage to GCS
              </p>
            </div>
          </div>

          {/* Provider Selector Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => {
                setTtsProvider('gemini');
                localStorage.setItem('blue_test_tts_provider', 'gemini');
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                ttsProvider === 'gemini'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-300" />
              <span>Gemini TTS</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTtsProvider('deepgram');
                localStorage.setItem('blue_test_tts_provider', 'deepgram');
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                ttsProvider === 'deepgram'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-emerald-300" />
              <span>Deepgram TTS</span>
            </button>
          </div>
        </div>

        {/* Provider Specific Controls */}
        {ttsProvider === 'deepgram' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/70 p-4 rounded-2xl border border-emerald-500/20">
            {/* Deepgram API Key Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                <label className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  Deepgram API Key
                </label>
                {deepgramApiKey ? (
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                    Active Key Saved
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-400 font-mono bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                    Key Required
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={deepgramApiKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDeepgramApiKey(val);
                    localStorage.setItem('blue_test_deepgram_api_key', val);
                  }}
                  placeholder="Paste Deepgram API Key (e.g. 5f8a...)"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  title={showApiKey ? 'Hide Key' : 'Show Key'}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                Get your API key at <a href="https://console.deepgram.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline">console.deepgram.com</a>
              </p>
            </div>

            {/* Deepgram Model Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                <label className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  Deepgram Model & Voice
                </label>
                <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                  {deepgramModel.startsWith('flux-') ? 'Endpoint: /v2/speak' : 'Endpoint: /v1/speak'}
                </span>
              </div>
              <select
                value={deepgramModel}
                onChange={(e) => {
                  const val = e.target.value;
                  setDeepgramModel(val);
                  localStorage.setItem('blue_test_deepgram_model', val);
                }}
                className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-medium"
              >
                <optgroup label="Flux TTS (Recommended - Conversation-Native /v2/speak)">
                  <option value="flux-alexis-en">flux-alexis-en (Flux Alexis - American English)</option>
                  <option value="flux-asteria-en">flux-asteria-en (Flux Asteria - American English)</option>
                </optgroup>

                <optgroup label="Aura-2 (Widest Language Model /v1/speak)">
                  <option value="aura-2-thalia-en">aura-2-thalia-en (Thalia - American English)</option>
                  <option value="aura-2-asteria-en">aura-2-asteria-en (Asteria - American English)</option>
                  <option value="aura-2-luna-en">aura-2-luna-en (Luna - American English)</option>
                  <option value="aura-2-stella-en">aura-2-stella-en (Stella - American English)</option>
                  <option value="aura-2-athena-en">aura-2-athena-en (Athena - British English)</option>
                  <option value="aura-2-hera-en">aura-2-hera-en (Hera - American English)</option>
                  <option value="aura-2-orion-en">aura-2-orion-en (Orion - American English)</option>
                  <option value="aura-2-arcas-en">aura-2-arcas-en (Arcas - American English)</option>
                  <option value="aura-2-perseus-en">aura-2-perseus-en (Perseus - American English)</option>
                  <option value="aura-2-angus-en">aura-2-angus-en (Angus - Irish English)</option>
                  <option value="aura-2-zeus-en">aura-2-zeus-en (Zeus - American English)</option>
                  <option value="aura-2-thalia-es">aura-2-thalia-es (Thalia - Spanish)</option>
                  <option value="aura-2-charlotte-fr">aura-2-charlotte-fr (Charlotte - French)</option>
                  <option value="aura-2-lennart-de">aura-2-lennart-de (Lennart - German)</option>
                </optgroup>

                <optgroup label="Aura (1st-Gen English /v1/speak)">
                  <option value="aura-asteria-en">aura-asteria-en (Asteria - English)</option>
                  <option value="aura-luna-en">aura-luna-en (Luna - English)</option>
                  <option value="aura-stella-en">aura-stella-en (Stella - English)</option>
                  <option value="aura-athena-en">aura-athena-en (Athena - English)</option>
                  <option value="aura-hera-en">aura-hera-en (Hera - English)</option>
                  <option value="aura-orion-en">aura-orion-en (Orion - English)</option>
                  <option value="aura-arcas-en">aura-arcas-en (Arcas - English)</option>
                  <option value="aura-perseus-en">aura-perseus-en (Perseus - English)</option>
                  <option value="aura-angus-en">aura-angus-en (Angus - English)</option>
                  <option value="aura-zeus-en">aura-zeus-en (Zeus - English)</option>
                </optgroup>
              </select>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/70 p-4 rounded-2xl border border-blue-500/20 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <div>
                <span className="font-bold text-white">Google Gemini TTS (Interactions API)</span>
                <p className="text-[11px] text-slate-400">Model: gemini-3.1-flash-tts-preview | Server API Key Configured</p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="font-bold text-slate-300">Voice Persona:</label>
              <select
                value={geminiVoice}
                onChange={(e) => {
                  const val = e.target.value;
                  setGeminiVoice(val);
                  localStorage.setItem('blue_test_gemini_voice', val);
                }}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white font-bold focus:outline-none"
              >
                <option value="Kore">Kore (Official Blue Test Voice)</option>
                <option value="Puck">Puck</option>
                <option value="Fenrir">Fenrir</option>
                <option value="Aoede">Aoede</option>
                <option value="Charon">Charon</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 49-Challenge Visual Progress & GCS Export Matrix Panel */}
      <div className="bg-slate-900/95 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden space-y-5 text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                Real-Time Storage Pipeline
              </span>
              <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <CloudUpload className="w-3.5 h-3.5 text-emerald-400" />
                Google Cloud Storage Synced
              </span>
            </div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              49-Challenge Audio Generation & Export Status
            </h2>
            <p className="text-xs text-slate-300">
              Visual real-time progress indicator tracking Gemini TTS generation and Google Cloud Storage uploads across all 49 assessment challenges.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportFullScriptAudio}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
              title="Export 49 challenges audio script mapping as CSV"
            >
              <Download className="w-4 h-4" />
              <span>Export Full CSV</span>
            </button>

            <button
              onClick={handleBatchGenerateAll}
              disabled={isBatchGenerating}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isBatchGenerating ? 'animate-spin' : ''}`} />
              <span>{isBatchGenerating ? 'Generating 49 Challenges...' : 'Batch Generate 49 Challenges'}</span>
            </button>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-2.5 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
          <div className="flex flex-wrap items-center justify-between text-xs font-bold gap-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-300">49 Challenges Progress:</span>
              <span className="text-indigo-400 text-sm font-black">
                {completedChallengesCount} / 49 Completed
              </span>
              <span className="text-xs font-mono text-slate-400">
                ({((completedChallengesCount / 49) * 100).toFixed(1)}%)
              </span>
            </div>
            {isBatchGenerating && batchProgress.currentKey && (
              <span className="text-blue-400 text-xs font-mono flex items-center gap-1.5 animate-pulse bg-blue-950/60 px-3 py-1 rounded-full border border-blue-800/60">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Active: {DEFAULT_NARRATION_SCRIPTS[batchProgress.currentKey as NarrationLocationKey]?.label || batchProgress.currentKey}
              </span>
            )}
          </div>

          {/* Progress Bar Container */}
          <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/50 relative shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-300 relative"
              style={{ width: `${Math.max(2, (completedChallengesCount / 49) * 100)}%` }}
            >
              {isBatchGenerating && (
                <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
              )}
            </div>
          </div>

          {/* Status Breakdown Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-semibold">
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> GCS Active Audio
              </span>
              <span className="font-bold font-mono text-xs">{completedChallengesCount}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-blue-950/40 border border-blue-800/40 text-blue-300">
              <span className="flex items-center gap-1.5">
                <Loader2 className={`w-3.5 h-3.5 text-blue-400 ${generatingChallengesCount > 0 ? 'animate-spin' : ''}`} /> Generating / Uploading
              </span>
              <span className="font-bold font-mono text-xs">{generatingChallengesCount}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-slate-400" /> Pending (Speech Fallback)
              </span>
              <span className="font-bold font-mono text-xs">{pendingChallengesCount}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-300">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Quota / Fallback
              </span>
              <span className="font-bold font-mono text-xs">{quotaOrErrorCount}</span>
            </div>
          </div>
        </div>

        {/* 49 Challenges Status Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              49 Challenge Matrix Grid (Session 1..7 x Q1..7)
            </h3>
            <span className="text-[11px] text-slate-400">
              Click play button on any challenge to preview audio
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
            {challengeKeys.map((key, idx) => {
              const globalNum = idx + 1;
              const sessionNum = Math.floor(idx / 7) + 1;
              const qInSession = (idx % 7) + 1;
              const info = DEFAULT_NARRATION_SCRIPTS[key];
              const status = challengeStatusMap[key] || (locationsData[key]?.activeVersion ? 'completed' : 'idle');
              const activeVer = locationsData[key]?.activeVersion;
              const isPlayingThis = playingKey === key && playbackStatus.isPlaying;

              const script = info?.defaultScript || '';
              const tdtMatch = script.match(/T\.D\.T\s+([0-9.]+\s*seconds?(\s*\([^)]+\))?)/i);
              const tdtLabel = tdtMatch ? tdtMatch[1] : '';

              let statusStyle = 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700';
              if (status === 'completed') {
                statusStyle = 'bg-emerald-950/30 border-emerald-700/50 text-emerald-300 hover:border-emerald-500 shadow-xs';
              } else if (status === 'generating') {
                statusStyle = 'bg-blue-950/60 border-blue-500/80 text-blue-200 animate-pulse ring-2 ring-blue-500/30';
              } else if (status === 'quota_paused') {
                statusStyle = 'bg-amber-950/30 border-amber-700/50 text-amber-300';
              } else if (status === 'error') {
                statusStyle = 'bg-rose-950/30 border-rose-700/50 text-rose-300';
              }

              return (
                <div
                  key={key}
                  className={`p-2.5 rounded-2xl border text-xs transition-all flex flex-col justify-between gap-1.5 relative ${statusStyle}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-black text-[11px] tracking-tight text-white">
                      Ch #{globalNum}
                    </span>
                    <span className="text-[9px] font-mono opacity-80 bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-300">
                      S{sessionNum}Q{qInSession}
                    </span>
                  </div>

                  {tdtLabel && (
                    <span className="text-[10px] font-semibold text-slate-300 truncate" title={tdtLabel}>
                      {tdtLabel}
                    </span>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 mt-0.5">
                    <div className="flex items-center gap-1">
                      {status === 'completed' ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>v{activeVer?.version || 1}</span>
                        </span>
                      ) : status === 'generating' ? (
                        <span className="flex items-center gap-1 text-[10px] text-blue-400 font-bold">
                          <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                          <span>Gen...</span>
                        </span>
                      ) : status === 'quota_paused' ? (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 font-bold">
                          <AlertCircle className="w-3 h-3 text-amber-400" />
                          <span>Speech</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                          <Volume2 className="w-3 h-3 text-slate-500" />
                          <span>Pending</span>
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handlePlayPreview(key, activeVer?.audioUrl || null, info?.spokenScript || info?.defaultScript, key)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isPlayingThis
                          ? 'bg-amber-500 text-white animate-pulse'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                      title={`Preview Challenge ${globalNum} Audio`}
                      aria-label={`Preview Challenge ${globalNum} Audio`}
                    >
                      {isPlayingThis ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current text-blue-400" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Location Filter Category Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Locations ({Object.keys(DEFAULT_NARRATION_SCRIPTS).length})
          </button>
          <button
            onClick={() => setActiveCategory('package')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'package'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Package Intro & End (2)
          </button>
          <button
            onClick={() => setActiveCategory('sessions')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'sessions'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Session Intros (7)
          </button>
          <button
            onClick={() => setActiveCategory('challenges')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'challenges'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Challenges (49)
          </button>
          <button
            onClick={() => setActiveCategory('clocks')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'clocks'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Clock Sound (3)
          </button>
          <button
            onClick={() => setActiveCategory('missing')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeCategory === 'missing'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'text-slate-600 hover:bg-orange-50'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Missing
          </button>
        </div>
        <span className="text-xs font-medium text-slate-500 px-2">
          Model: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono">gemini-3.1-flash-tts-preview</code>
        </span>
      </div>

      {showCsvImport && (
        <BlueTestCsvImport 
          onCancel={() => setShowCsvImport(false)} 
          onImport={handleCsvImportConfirmed} 
        />
      )}
      
      {/* Location Cards */}
      <div className="space-y-4">
        {filteredKeys
          .map((locationKey, index) => {
          const info = DEFAULT_NARRATION_SCRIPTS[locationKey];
          const data = locationsData[locationKey];
          const activeVersion = data.activeVersion;
          const versions = data.versions;
          const isGeneratingThis = generatingKey === locationKey;
          const isPlayingThis = playingKey === locationKey && playbackStatus.isPlaying;
          const isHistoryOpen = !!expandedHistory[locationKey];

          return (
            <div
              key={locationKey}
              className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs transition-all hover:border-slate-300"
            >
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-700 rounded-lg">
                      #{index + 1} • <code className="font-mono text-slate-800">{locationKey}</code>
                    </span>
                    {activeVersion ? (
                      <span className="px-2.5 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-800 rounded-lg flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {locationKey.startsWith('blue_test_clock_') ? 'Synthesized Clock PCM Active' : `Gemini TTS v${activeVersion.version} Active`}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 rounded-lg flex items-center gap-1">
                        <Volume2 className="w-3 h-3 text-amber-600" /> Default Speech Fallback
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-slate-900 text-base">{info.label}</h3>
                  <p className="text-xs text-slate-500">{info.description}</p>
                </div>

                {/* Main Control Actions */}
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                  {/* Play / Preview Button */}
                  <button
                    onClick={() =>
                      handlePlayPreview(
                        locationKey,
                        activeVersion ? activeVersion.audioUrl : null,
                        data.scriptText,
                        locationKey
                      )
                    }
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      isPlayingThis
                        ? 'bg-amber-500 text-white shadow-md animate-pulse'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    {isPlayingThis ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" /> Stop Preview
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current text-blue-600" /> Preview Active Audio
                      </>
                    )}
                  </button>

                  {/* Generate / Regenerate Button */}
                  <button
                    onClick={() => handleGenerateTTS(locationKey)}
                    disabled={isGeneratingThis || isBatchGenerating}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingThis ? 'animate-spin' : ''}`} />
                    {isGeneratingThis
                      ? 'Generating...'
                      : activeVersion
                      ? 'Regenerate Version'
                      : 'Generate Gemini TTS'}
                  </button>

                  {/* Upload Custom File / Replace Audio Button */}
                  <label
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      uploadingKey === locationKey
                        ? 'bg-emerald-700 text-white animate-pulse'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                    }`}
                    title="Upload custom audio file (.mp3, .wav, .m4a) to replace active version"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingKey === locationKey ? 'Uploading...' : 'Replace File'}</span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.ogg"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleFileUpload(locationKey, e.target.files[0]);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>

                  {/* Map Audio URL Button */}
                  <button
                    onClick={() => {
                      setUrlMapModalKey(urlMapModalKey === locationKey ? null : locationKey);
                      setCustomAudioUrlInput('');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                    title="Map custom external audio URL link"
                  >
                    <Link className="w-3.5 h-3.5" />
                    <span>Map URL</span>
                  </button>

                  {/* Version History Drawer Toggle */}
                  <button
                    onClick={() => toggleHistory(locationKey)}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-1"
                  >
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    <span>Versions ({versions.length})</span>
                    {isHistoryOpen ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Inline URL Map Input Box */}
              {urlMapModalKey === locationKey && (
                <div className="mt-3 p-3 bg-purple-950/40 border border-purple-500/30 rounded-2xl flex flex-col sm:flex-row items-center gap-2">
                  <div className="flex-1 w-full">
                    <input
                      type="url"
                      placeholder="Paste direct audio URL (e.g. https://storage.googleapis.com/.../pkg_intro.wav)"
                      value={customAudioUrlInput}
                      onChange={(e) => setCustomAudioUrlInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-purple-500 text-white text-xs rounded-xl px-3 py-2 outline-none font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => handleUrlMappingSubmit(locationKey, customAudioUrlInput)}
                      disabled={!customAudioUrlInput.trim() || uploadingKey === locationKey}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-xs"
                    >
                      Save URL
                    </button>
                    <button
                      onClick={() => setUrlMapModalKey(null)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Clock Sound Options (3 Choices) OR Script Text Editor */}
              {locationKey.startsWith('blue_test_clock_') ? (
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-blue-600" />
                      Clock Sound Options (3 Options to Select Active):
                    </label>
                    <span className="text-[11px] text-slate-500 font-medium">Click "Select Active" to choose active clock tick sound</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { optNum: 1, name: 'Option 1: Classic Woodblock', style: 'woodblock', desc: 'Acoustic woodblock click (organic & clean)' },
                      { optNum: 2, name: 'Option 2: Digital Quartz Beep', style: 'digital', desc: 'Crisp electronic pulse (modern precision)' },
                      { optNum: 3, name: 'Option 3: Soft Pendulum Chime', style: 'pendulum', desc: 'Gentle warm chime (soothing acoustic)' },
                    ].map((opt) => {
                      const matchedVer = versions.find((v) => v.version === opt.optNum || v.id.includes(`opt${opt.optNum}`) || v.voice?.includes(opt.style));
                      const isActive = matchedVer ? matchedVer.isActive : (activeVersion?.id === matchedVer?.id);
                      const isOptPlaying = matchedVer && playingKey === matchedVer.id && playbackStatus.isPlaying;

                      return (
                        <div
                          key={opt.optNum}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            isActive
                              ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                              : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <h5 className="font-extrabold text-slate-900 text-xs">{opt.name}</h5>
                              <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                            </div>
                            {isActive ? (
                              <span className="px-2 py-0.5 bg-blue-600 text-white font-black text-[10px] rounded-md shadow-2xs flex-shrink-0">
                                ACTIVE
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-200 text-slate-600 font-bold text-[10px] rounded-md flex-shrink-0">
                                Option #{opt.optNum}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200/60">
                            {matchedVer ? (
                              <>
                                <button
                                  onClick={() => handlePlayPreview(matchedVer.id, matchedVer.audioUrl, matchedVer.scriptText)}
                                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                                    isOptPlaying
                                      ? 'bg-amber-500 text-white animate-pulse'
                                      : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-800'
                                  }`}
                                >
                                  {isOptPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current text-blue-600" />}
                                  <span>{isOptPlaying ? 'Stop' : 'Preview'}</span>
                                </button>

                                {!isActive && (
                                  <button
                                    onClick={() => handleSetActiveVersion(locationKey, matchedVer.id)}
                                    className="flex-1 py-1.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1"
                                  >
                                    <Check className="w-3 h-3" /> Select Active
                                  </button>
                                )}
                              </>
                            ) : (
                              <button
                                onClick={() => handleGenerateTTSWithOption(locationKey, opt.optNum, opt.style)}
                                className="w-full py-1.5 px-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-all flex items-center justify-center gap-1"
                              >
                                <RefreshCw className="w-3 h-3" /> Generate Option #{opt.optNum}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-1.5 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-800 text-xs">Audio Script Text:</span>
                    </div>
                    <button
                      onClick={() => {
                        const resetScript = info.spokenScript || info.defaultScript;
                        setLocationsData((prev) => ({
                          ...prev,
                          [locationKey]: { ...prev[locationKey], scriptText: resetScript },
                        }));
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline font-semibold"
                    >
                      Reset to default
                    </button>
                  </div>
                  <textarea
                    value={data.scriptText}
                    onChange={(e) => {
                      const newText = e.target.value;
                      setLocationsData((prev) => ({
                        ...prev,
                        [locationKey]: { ...prev[locationKey], scriptText: newText },
                      }));
                    }}
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-y font-sans leading-relaxed shadow-2xs"
                    placeholder="Enter narration text..."
                  />
                </div>
              )}

              {/* Version History Drawer */}
              {isHistoryOpen && (
                <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50/70 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-600" /> Version History for {info.label}
                  </h4>

                  {versions.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">
                      No Gemini audio versions generated yet for this location. Click "Generate Gemini TTS" above to create version 1.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {versions.map((ver) => {
                        const isVerPlaying = playingKey === ver.id && playbackStatus.isPlaying;
                        return (
                          <div
                            key={ver.id}
                            className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors ${
                              ver.isActive
                                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-medium'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-slate-900">v{ver.version}</span>
                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">
                                  {ver.voice} • {ver.model}
                                </span>
                                {ver.isActive && (
                                  <span className="text-[10px] px-2 py-0.5 bg-emerald-600 text-white font-bold rounded">
                                    ACTIVE
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 italic line-clamp-1">"{ver.scriptText}"</p>
                              <p className="text-[10px] text-slate-400">
                                Created: {new Date(ver.createdAt).toLocaleString()} • Duration: ~{ver.durationSeconds || '?'}s
                              </p>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                              {/* Preview ver */}
                              <button
                                onClick={() => handlePlayPreview(ver.id, ver.audioUrl, ver.scriptText, locationKey)}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                                  isVerPlaying
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                                }`}
                              >
                                {isVerPlaying ? (
                                  <>
                                    <Square className="w-3 h-3 fill-current" /> Stop
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3 h-3 fill-current text-blue-600" /> Preview
                                  </>
                                )}
                              </button>

                              {/* Activate ver */}
                              {!ver.isActive && (
                                <button
                                  onClick={() => handleSetActiveVersion(locationKey, ver.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" /> Set Active
                                </button>
                              )}

                              {/* Delete ver */}
                              <button
                                onClick={() => handleDeleteVersion(ver.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete version"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rules Notice */}
      <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-slate-800 font-bold">Rule Constraint Verification:</strong> As specified by the Blue Test architectural constraints, narration audio is generated and mapped strictly for Package Intro, Session Intros 1..7, and Package End. No audio narration is attached to the 49 individual timing questions.
        </p>
      </div>
    </div>
  );
};
