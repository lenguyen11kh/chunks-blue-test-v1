/**
 * Audio service providing Web Audio API synthesizer for Start/End Bell
 * and Web Speech API / Audio Narration for Intros with error handling.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Plays a clean Start Bell synthesizer sound (high chime).
 */
export function playStartBell(): Promise<void> {
  return new Promise((resolve) => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note

    gain.gain.setValueAtTime(1.0, ctx.currentTime); // Maximum volume
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(resolve, 400);
  } catch (err) {
    console.warn('Start Bell audio synthesis failed:', err);
    resolve();
  }
  });
}

/**
 * Plays a clean End Bell synthesizer sound (double tone chime).
 */
export function playEndBell(): Promise<void> {
  stopClockLoop();
  return new Promise((resolve) => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(1.0, now); // Maximum volume
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Tone 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.15); // A5
    gain2.gain.setValueAtTime(1.0, now + 0.15); // Maximum volume
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.6);
    setTimeout(resolve, 600);
  } catch (err) {
    console.warn('End Bell audio synthesis failed:', err);
    resolve();
  }
  });
}


/**
 * Plays a sound effect based on score/ratio (0 = sad, 1 = happy)
 */
export function playScoreEffect(ratio: number): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    const startFreq = 300 + (ratio * 400); 
    const endFreq = startFreq * (0.8 + (ratio * 0.7)); 
    
    osc.type = ratio > 0.5 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.3);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.5);
    
    if (ratio > 0.7) {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(startFreq * 1.5, now + 0.1);
      osc2.frequency.exponentialRampToValueAtTime(endFreq * 1.5, now + 0.4);
      gain2.gain.setValueAtTime(0.15, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.6);
    }
  } catch (err) {
    console.warn('Score effect synthesis failed:', err);
  }
}

export interface NarrationStatus {
  isPlaying: boolean;
  isPaused?: boolean;
  hasError: boolean;
  errorMessage?: string;
  source?: 'gemini_asset' | 'web_speech';
  title?: string;
  text?: string;
  audioUrl?: string | null;
}

interface ActiveNarrationContext {
  audioUrl?: string | null;
  text: string;
  title?: string;
  onStatusChange?: (status: NarrationStatus) => void;
  onEnded?: () => void;
  source: 'gemini_asset' | 'web_speech';
  audioElement?: HTMLAudioElement | null;
  utterance?: SpeechSynthesisUtterance | null;
}

let activeAudioElement: HTMLAudioElement | null = null;
let activeNarrationContext: ActiveNarrationContext | null = null;
let activeStatusCallback: ((status: NarrationStatus) => void) | null = null;
let currentPlaybackRate: number = 1.0;

export function setPlaybackRate(rate: number): void {
  currentPlaybackRate = Math.max(0.5, Math.min(2.0, rate));
  if (activeAudioElement) {
    try {
      activeAudioElement.playbackRate = currentPlaybackRate;
    } catch (e) {
      console.warn('Failed setting audio element playback rate:', e);
    }
  }
}

export function getPlaybackRate(): number {
  return currentPlaybackRate;
}

function notifyStatus(status: NarrationStatus): void {
  if (activeStatusCallback) {
    activeStatusCallback(status);
  }
}

/**
 * Fallback Web Speech API speech synthesis
 */
export function playWebSpeech(
  text: string,
  onStatusChange?: (status: NarrationStatus) => void,
  onEnded?: () => void,
  title?: string
): () => void {
  stopNarration();
  activeStatusCallback = onStatusChange || null;
  const currentTitle = title || 'Speech Synthesis';

  if (!('speechSynthesis' in window) || !text) {
    notifyStatus({
      isPlaying: false,
      hasError: false,
      source: 'web_speech',
      title: currentTitle,
      text,
    });
    if (onEnded) onEnded();
    return () => {};
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = currentPlaybackRate;
    utterance.lang = 'vi-VN';

    const context: ActiveNarrationContext = {
      text,
      title: currentTitle,
      onStatusChange,
      onEnded,
      source: 'web_speech',
      utterance,
    };
    activeNarrationContext = context;

    notifyStatus({
      isPlaying: true,
      isPaused: false,
      hasError: false,
      source: 'web_speech',
      title: currentTitle,
      text,
    });

    utterance.onend = () => {
      if (activeNarrationContext === context) {
        activeNarrationContext = null;
        notifyStatus({
          isPlaying: false,
          isPaused: false,
          hasError: false,
          source: 'web_speech',
          title: '',
        });
        if (onEnded) onEnded();
      }
    };

    utterance.onerror = (e) => {
      console.warn('Speech synthesis error:', e);
      if (activeNarrationContext === context) {
        activeNarrationContext = null;
        notifyStatus({
          isPlaying: false,
          isPaused: false,
          hasError: true,
          errorMessage: 'Speech synthesis failed',
          source: 'web_speech',
          title: currentTitle,
        });
        if (onEnded) onEnded();
      }
    };

    window.speechSynthesis.speak(utterance);

    return () => {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    };
  } catch (err) {
    console.warn('Web Speech API failed:', err);
    if (onEnded) onEnded();
    return () => {};
  }
}

import { AudioStorageAdapter } from '../persistence/audio-storage';
import { NarrationLocationKey } from '../types/blue-test';

/**
 * Plays an active Gemini Audio Asset WAV URL. Does not fall back to Web Speech API synthesis.
 */
export function playNarrationAssetOrSpeech(
  audioUrl: string | null | undefined,
  text: string,
  onStatusChange?: (status: NarrationStatus) => void,
  onEnded?: () => void,
  title?: string,
  targetKey?: NarrationLocationKey | string
): () => void {
  stopNarration();
  stopClockLoop();

  let resolvedUrl = audioUrl;
  if (!resolvedUrl && targetKey) {
    const activeAsset = AudioStorageAdapter.getActiveVersion(targetKey as NarrationLocationKey);
    if (activeAsset) {
      resolvedUrl = activeAsset.audioUrl;
    } else {
      const anyVersions = AudioStorageAdapter.getVersionsForLocation(targetKey as NarrationLocationKey);
      if (anyVersions.length > 0) {
        resolvedUrl = anyVersions[anyVersions.length - 1].audioUrl;
      }
    }
  }

  if (resolvedUrl) {
    let hasFailed = false;
    const handleFailure = (reason: string) => {
      if (hasFailed) return;
      hasFailed = true;
      console.warn(`Gemini audio asset playback failed (${reason}) for: "${text}". Strictly skipping machine voice fallback.`);
      notifyStatus({
        isPlaying: false,
        isPaused: false,
        hasError: true,
        errorMessage: `Audio asset playback failed (${reason})`,
        source: 'gemini_asset',
        title: title || 'Test Narration',
        text,
      });
      if (onEnded) onEnded();
    };

    try {
      const audio = new Audio(resolvedUrl);
      audio.playbackRate = currentPlaybackRate;
      activeAudioElement = audio;

      const currentTitle = title || 'Test Narration';
      activeStatusCallback = onStatusChange || null;

      const context: ActiveNarrationContext = {
        audioUrl: resolvedUrl,
        text,
        title: currentTitle,
        onStatusChange,
        onEnded,
        source: 'gemini_asset',
        audioElement: audio,
      };
      activeNarrationContext = context;

      notifyStatus({
        isPlaying: true,
        isPaused: false,
        hasError: false,
        source: 'gemini_asset',
        title: currentTitle,
        text,
        audioUrl: resolvedUrl,
      });

      audio.onended = () => {
        if (activeNarrationContext === context) {
          activeAudioElement = null;
          activeNarrationContext = null;
          notifyStatus({
            isPlaying: false,
            isPaused: false,
            hasError: false,
            source: 'gemini_asset',
            title: '',
          });
          if (onEnded) onEnded();
        }
      };

      audio.onerror = () => {
        handleFailure('404 or media error');
      };

      audio.play().catch((playErr) => {
        handleFailure('Autoplay prevented or load error: ' + playErr);
      });

      return () => {
        if (activeAudioElement === audio) {
          stopNarration();
        }
      };
    } catch (e) {
      handleFailure('Error creating Audio element');
      return () => {};
    }
  }

  // Strictly no robotic machine voice fallback in Audio Studio mode
  console.warn(`No active Audio Studio asset available for key "${targetKey || title}". Machine voice disabled.`);
  notifyStatus({
    isPlaying: false,
    isPaused: false,
    hasError: true,
    errorMessage: `No Audio Studio asset available for ${targetKey || title}`,
    source: 'gemini_asset',
    title: title || 'Test Narration',
    text,
  });
  if (onEnded) onEnded();
  return () => {};
}

/**
 * Pauses active narration (works for HTML Audio elements).
 */
export function pauseNarration(): void {
  if (!activeNarrationContext) return;

  if (activeNarrationContext.source === 'gemini_asset' && activeAudioElement) {
    try {
      activeAudioElement.pause();
    } catch (e) {
      console.warn('Error pausing audio element:', e);
    }
  }

  notifyStatus({
    isPlaying: false,
    isPaused: true,
    hasError: false,
    source: activeNarrationContext.source,
    title: activeNarrationContext.title,
    text: activeNarrationContext.text,
    audioUrl: activeNarrationContext.audioUrl,
  });
}

/**
 * Resumes paused narration.
 */
export function resumeNarration(): void {
  if (!activeNarrationContext) return;

  if (activeNarrationContext.source === 'gemini_asset' && activeAudioElement) {
    try {
      activeAudioElement.play().catch((err) => console.warn('Error resuming audio element:', err));
    } catch (e) {
      console.warn('Error resuming audio element:', e);
    }
  }

  notifyStatus({
    isPlaying: true,
    isPaused: false,
    hasError: false,
    source: activeNarrationContext.source,
    title: activeNarrationContext.title,
    text: activeNarrationContext.text,
    audioUrl: activeNarrationContext.audioUrl,
  });
}

/**
 * Restarts current narration from the beginning.
 */
export function restartNarration(): void {
  if (!activeNarrationContext) return;

  const { audioUrl, text, title, onStatusChange, onEnded } = activeNarrationContext;
  playNarrationAssetOrSpeech(audioUrl, text, onStatusChange, onEnded, title);
}

/**
 * Stops narration completely and resets state.
 */
export function stopNarration(): void {
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      // ignore
    }
  }

  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch (e) {
      // ignore
    }
    activeAudioElement = null;
  }

  if (activeNarrationContext) {
    activeNarrationContext = null;
    notifyStatus({
      isPlaying: false,
      isPaused: false,
      hasError: false,
      title: '',
    });
  }
}

// ============================================================================
// EXPLICIT NARRATION QUEUE MANAGER
// ============================================================================

export type NarrationKind =
  | 'test_intro'
  | 'session_intro'
  | 'question_number'
  | 'question_cue'
  | 'test_end';

export interface NarrationQueueItem {
  id: string;
  kind: NarrationKind;
  targetKey: string;
  title: string;
  assignmentId: string;
  sessionNumber?: number;
  sessionQuestionNumber?: number;
  globalOrder?: number;
  text: string;
  audioUrl?: string | null;
}

export type NarrationQueueState =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'blocked'
  | 'failed'
  | 'completed';

class NarrationQueueManager {
  private queue: NarrationQueueItem[] = [];
  private currentItem: NarrationQueueItem | null = null;
  private state: NarrationQueueState = 'idle';
  private listeners: Set<(state: NarrationQueueState, item: NarrationQueueItem | null) => void> = new Set();
  private cancelCurrentPlayback: (() => void) | null = null;

  public subscribe(listener: (state: NarrationQueueState, item: NarrationQueueItem | null) => void) {
    this.listeners.add(listener);
    listener(this.state, this.currentItem);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn(this.state, this.currentItem));
  }

  public enqueue(items: NarrationQueueItem | NarrationQueueItem[]) {
    const list = Array.isArray(items) ? items : [items];
    this.queue.push(...list);
    if (this.state === 'idle' || this.state === 'completed' || this.state === 'failed') {
      this.processNext();
    }
  }

  public clearAndEnqueue(items: NarrationQueueItem | NarrationQueueItem[]) {
    this.clearQueue();
    this.enqueue(items);
  }

  public clearQueue() {
    this.queue = [];
    if (this.cancelCurrentPlayback) {
      try {
        this.cancelCurrentPlayback();
      } catch (e) {
        // ignore
      }
      this.cancelCurrentPlayback = null;
    }
    stopNarration();
    this.currentItem = null;
    this.state = 'idle';
    this.notify();
  }

  public clear() {
    this.clearQueue();
  }

  public processNext() {
    if (this.queue.length === 0) {
      this.currentItem = null;
      this.state = 'completed';
      this.notify();
      return;
    }

    const nextItem = this.queue.shift()!;
    this.currentItem = nextItem;
    this.state = 'playing';
    this.notify();

    const resolvedUrl = nextItem.audioUrl || (nextItem.targetKey ? AudioStorageAdapter.getActiveVersion(nextItem.targetKey as NarrationLocationKey)?.audioUrl : null);

    this.cancelCurrentPlayback = playNarrationAssetOrSpeech(
      resolvedUrl,
      nextItem.text,
      (status) => {
        if (status.hasError) {
          this.state = 'failed';
        } else if (status.isPaused) {
          this.state = 'paused';
        } else if (status.isPlaying) {
          this.state = 'playing';
        }
        this.notify();
      },
      () => {
        this.cancelCurrentPlayback = null;
        this.processNext();
      },
      nextItem.title,
      nextItem.targetKey
    );
  }

  public getCurrentItem(): NarrationQueueItem | null {
    return this.currentItem;
  }

  public getState(): NarrationQueueState {
    return this.state;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}

export const narrationQueue = new NarrationQueueManager();


// ============================================================================
// CLOCK SOUND MANAGER
// ============================================================================

let activeClockAudio: HTMLAudioElement | null = null;
let fadeInterval: any = null;
let synthClockInterval: any = null;
let isClockRequested = false;

export function stopClockLoop(): void {
  isClockRequested = false;

  if (synthClockInterval) {
    clearInterval(synthClockInterval);
    synthClockInterval = null;
  }
  if (fadeInterval) {
    clearInterval(fadeInterval);
    fadeInterval = null;
  }
  if (activeClockAudio) {
    const audioToStop = activeClockAudio;
    activeClockAudio = null;
    try {
      audioToStop.pause();
      audioToStop.src = '';
    } catch (e) {
      // ignore
    }
  }
}

export function playSynthesizedClockLoop(bpm: number, volume: number): void {
  stopClockLoop();
  isClockRequested = true;

  try {
    const ctx = getAudioContext();
    const intervalMs = Math.floor(60000 / bpm);
    let beat = 0;

    const playTick = () => {
      if (!isClockRequested) {
        if (synthClockInterval) {
          clearInterval(synthClockInterval);
          synthClockInterval = null;
        }
        return;
      }

      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const freq = (beat % 2 === 0) ? 1350 : 950;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(volume * 0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.05);

        beat++;
      } catch (e) {
        console.warn('Synth tick error', e);
      }
    };

    playTick();
    synthClockInterval = setInterval(playTick, intervalMs);
  } catch (err) {
    console.warn('Synth clock start failed', err);
  }
}

export function playClockLoop(audioUrl: string | null | undefined, volume: number, fallbackBpm = 60): void {
  try {
    if (!audioUrl) {
      playSynthesizedClockLoop(fallbackBpm, volume);
      return;
    }

    if (isClockRequested && activeClockAudio && (activeClockAudio.src === audioUrl || activeClockAudio.src.endsWith(audioUrl))) {
      // Already playing this asset, just update volume if needed
      activeClockAudio.volume = volume;
      return;
    }

    // Stop existing clock audio/intervals before starting new track
    stopClockLoop();
    isClockRequested = true;

    const newAudio = new Audio(audioUrl);
    newAudio.loop = true;
    newAudio.volume = volume;
    activeClockAudio = newAudio;

    const playPromise = newAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        if (!isClockRequested || activeClockAudio !== newAudio) {
          try {
            newAudio.pause();
            newAudio.src = '';
          } catch (e) {
            // ignore
          }
        }
      }).catch((e) => {
        // Guard: If clock was stopped or active audio changed, do NOT fallback or restart
        if (!isClockRequested || activeClockAudio !== newAudio) {
          return;
        }
        // Ignore AbortError / NotAllowedError caused by pause()
        if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
          return;
        }

        console.warn('Clock audio file play failed, falling back to Web Audio synth', e);
        playSynthesizedClockLoop(fallbackBpm, volume);
      });
    }

  } catch (e) {
    if (isClockRequested) {
      console.warn('Clock play error, falling back to Web Audio synth', e);
      playSynthesizedClockLoop(fallbackBpm, volume);
    }
  }
}

/**
 * Completely stops all audio playback, narration, clock loops,
 * clears the narration queue, and pauses any active HTML5 audio elements.
 */
export function stopAllAudio(): void {
  stopNarration();
  stopClockLoop();
  narrationQueue.clearQueue();

  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
      activeAudioElement.src = '';
    } catch (e) {
      // ignore
    }
    activeAudioElement = null;
  }

  if (typeof document !== 'undefined') {
    try {
      const audioElements = document.querySelectorAll('audio, video');
      audioElements.forEach((el) => {
        try {
          const media = el as HTMLMediaElement;
          media.pause();
          media.currentTime = 0;
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
      // ignore
    }
  }
}
