
import { BlueAudioVersion, NarrationLocationKey, AudioStorageVerificationReport } from '../types/blue-test';
import { CHALLENGE_NARRATION_SCRIPTS } from './challenge-scripts';

// In-memory cache to guarantee synchronous availability
let inMemoryVersionsCache: BlueAudioVersion[] | null = null;
let inMemoryActiveMappingsCache: Record<NarrationLocationKey, string | null> | null = null;
const audioStorageSubscribers: Array<() => void> = [];

export const DEFAULT_NARRATION_SCRIPTS: Record<NarrationLocationKey, { label: string; description: string; defaultScript: string; spokenScript?: string; isChallenge?: boolean }> = {
  ...CHALLENGE_NARRATION_SCRIPTS,

  blue_test_clock_slow: {
    label: 'Clock Slow',
    description: 'Slow ticking clock loop',
    defaultScript: 'Clock Tick 60 BPM',
  },
  blue_test_clock_medium: {
    label: 'Clock Medium',
    description: 'Medium ticking clock loop',
    defaultScript: 'Clock Tick 120 BPM',
  },
  blue_test_clock_urgent: {
    label: 'Clock Urgent',
    description: 'Urgent ticking clock loop',
    defaultScript: 'Clock Tick 240 BPM',
  },

  pkg_intro: {
    label: 'Package Intro (Start-red-test)',
    description: 'CHUNKS Test No. 3 Official Blue Room Intro',
    defaultScript: `CHUNKS TEST No.3

Welcome to CHUNKS Test No. 3, also known as the Blue Test or Observation Test. This assessment is developed by CHUNKS based on CHUNKS Theory and will take place in the official Blue Room. The session will be recorded for review and analysis. A wide range of logical and illogical motions and sounds, including Vietnamese and English expressions, will be used to assess real-time audiovisual observation and intuitive MSE authorship.

This blue test is suitable for all regardless of your nationality. It lasts approximately 30 minutes and includes 49 challenges with progressively increasing Threshold Delay Time (or TDT), ranging from less than one second to 77 seconds, also known as the CHUNKS Gate. 

In this test, the test taker assumes the role of Captain, while the Crew mirrors all of the Captain’s Motion–Sound–Emotion (MSE) inputs. Their relative attention–intention levels are recorded in advance as Captain over Crew (CoC). This ratio directly adjusts the Captain’s final intuition score, or %i. If the Captain fails to break the Crew’s mirroring flow within the assigned TDT, the Delay Time for that challenge becomes infinitive. MDT value records the Captain’s fastest successful conscious trick or shortest delay time, while %CPD represents the percentage of challenges in which the Captain successfully breaks the Crew’s flow before reaching TDT.

During every challenge, the test taker must remain calm and keep the Crew within sight, observing them without judgment. The Captain must not move too fast or obstruct sight or hearing. If the Captain overspeeds or loses control, that DT immediately becomes iDT and the Crew wins it. The delay between the Captain’s action and the Crew’s response must remain within one second. CiC will immediately stop the challenge either when any delayed response, especially incorrect movement, sound or facial expression from the Crew was found or when DT hits TDT. The official 7-color assessment system will be used to track %x and Delay Time values across 49 challenges.`,
    spokenScript: `Welcome to CHUNKS Test No. 3, also known as the Blue Test or Observation Test. This assessment is developed by CHUNKS based on CHUNKS Theory and will take place in the official Blue Room. The session will be recorded for review and analysis. A wide range of logical and illogical motions and sounds, including Vietnamese and English expressions, will be used to assess real-time audiovisual observation and intuitive MSE authorship. This blue test is suitable for all regardless of your nationality. It lasts approximately 30 minutes and includes 49 challenges with progressively increasing Threshold Delay Time (or TDT), ranging from less than one second to 77 seconds, also known as the CHUNKS Gate. In this test, the test taker assumes the role of Captain, while the Crew mirrors all of the Captain's Motion-Sound-Emotion inputs. Their relative attention-intention levels are recorded in advance as Captain over Crew. This ratio directly adjusts the Captain's final intuition score, or %i. If the Captain fails to break the Crew's mirroring flow within the assigned TDT, the Delay Time for that challenge becomes infinitive. MDT value records the Captain's fastest successful conscious trick or shortest delay time, while %CPD represents the percentage of challenges in which the Captain successfully breaks the Crew's flow before reaching TDT. During every challenge, the test taker must remain calm and keep the Crew within sight, observing them without judgment. The Captain must not move too fast or obstruct sight or hearing. If the Captain overspeeds or loses control, that DT immediately becomes iDT and the Crew wins it. The delay between the Captain's action and the Crew's response must remain within one second. CiC will immediately stop the challenge either when any delayed response, especially incorrect movement, sound or facial expression from the Crew was found or when DT hits TDT. The official 7-color assessment system will be used to track %x and Delay Time values across 49 challenges.`,
  },
  session_1_intro: {
    label: 'Session 1 Intro',
    description: 'Intro-session-1: Marker',
    defaultScript: 'Session 1 – Marker – T.D.T 1.86 seconds (aka CHUNKS CONSTANT)',
    spokenScript: 'Session 1 – Marker – T.D.T 1.86 seconds (aka CHUNKS CONSTANT)',
  },
  session_2_intro: {
    label: 'Session 2 Intro',
    description: 'Intro-session-2: Chair',
    defaultScript: 'Session 2 – Chair – T.D.T 3.5 seconds',
    spokenScript: 'Session 2 – Chair – T.D.T 3.5 seconds',
  },
  session_3_intro: {
    label: 'Session 3 Intro',
    description: 'Intro-session-3: Magnet',
    defaultScript: 'Session 3 – Magnet – T.D.T 6.4 seconds',
    spokenScript: 'Session 3 – Magnet – T.D.T 6.4 seconds',
  },
  session_4_intro: {
    label: 'Session 4 Intro',
    description: 'Intro-session-4: Cup',
    defaultScript: 'Session 4 – Cup – T.D.T 12 seconds',
    spokenScript: 'Session 4 – Cup – T.D.T 12 seconds',
  },
  session_5_intro: {
    label: 'Session 5 Intro',
    description: 'Intro-session-5: Photo',
    defaultScript: 'Session 5 – Photo – T.D.T 22.3 seconds',
    spokenScript: 'Session 5 – Photo – T.D.T 22.3 seconds',
  },
  session_6_intro: {
    label: 'Session 6 Intro',
    description: 'Intro-session-6: Book',
    defaultScript: 'Session 6 – Book – T.D.T 41.4 seconds',
    spokenScript: 'Session 6 – Book – T.D.T 41.4 seconds',
  },
  session_7_intro: {
    label: 'Session 7 Intro',
    description: 'Intro-session-7: Person',
    defaultScript: 'Session 7 – Person – T.D.T 77 seconds (aka CHUNKS GATE)',
    spokenScript: 'Session 7 – Person – T.D.T 77 seconds (aka CHUNKS GATE)',
  },
  pkg_end: {
    label: 'Package End Narration (End-red-test)',
    description: 'CHUNKS Test No. 3 Official Blue Room Package End',
    defaultScript: `This is the end of CHUNKS Test No. 3. After the test, the test taker will receive the result verbally from the CiC. A digital copy of the official result, including the test taker’s ID picture, will be sent directly to the registered email address within 24 hours.
Thank you for completing the Blue Test with us.`,
    spokenScript: `This is the end of CHUNKS Test No. 3. After the test, the test taker will receive the result verbally from the CiC. A digital copy of the official result, including the test taker's ID picture, will be sent directly to the registered email address within 24 hours. Thank you for completing the Blue Test with us.`,
  },
  
};

export class AudioStorageAdapter {
  static subscribe(listener: () => void): () => void {
    audioStorageSubscribers.push(listener);
    return () => {
      const idx = audioStorageSubscribers.indexOf(listener);
      if (idx >= 0) audioStorageSubscribers.splice(idx, 1);
    };
  }

  static notifySubscribers(): void {
    audioStorageSubscribers.forEach((fn) => {
      try { fn(); } catch (e) { console.warn('AudioStorageAdapter subscriber error', e); }
    });
  }

  static async syncFromCloud(): Promise<void> {
    try {
      const res = await fetch('/api/cloud-audio-versions');
      if (!res.ok) return;
      const data = await res.json();
      const cloudVersions: BlueAudioVersion[] = Array.isArray(data.versions) ? data.versions : [];
      const cloudMappings: Record<string, string | null> = data.activeMappings || {};

      let hasChanges = false;
      const currentVersions = [...this.getAllVersions()];

      for (const cloudVer of cloudVersions) {
        if (!cloudVer || !cloudVer.id) continue;
        const index = currentVersions.findIndex((v) => v.id === cloudVer.id);
        if (index === -1) {
          currentVersions.push(cloudVer);
          hasChanges = true;
        } else {
          if (cloudVer.audioUrl && currentVersions[index].audioUrl !== cloudVer.audioUrl) {
            currentVersions[index] = { ...currentVersions[index], ...cloudVer };
            hasChanges = true;
          }
        }
      }

      inMemoryVersionsCache = currentVersions;

      const currentMappings = { ...this.getActiveMappings() };
      for (const [key, val] of Object.entries(cloudMappings)) {
        if (val && currentMappings[key as NarrationLocationKey] !== val) {
          currentMappings[key as NarrationLocationKey] = val;
          hasChanges = true;
        }
      }

      for (const cloudVer of cloudVersions) {
        if (cloudVer.isActive && cloudVer.locationKey) {
          if (currentMappings[cloudVer.locationKey as NarrationLocationKey] !== cloudVer.id) {
            currentMappings[cloudVer.locationKey as NarrationLocationKey] = cloudVer.id;
            hasChanges = true;
          }
        }
      }

      inMemoryActiveMappingsCache = currentMappings;

      if (hasChanges) {
        this.notifySubscribers();
      }
    } catch (e) {
      console.warn('[AudioStorageAdapter] Failed to sync audio from cloud:', e);
    }
  }

  static async initFromServer(): Promise<void> {
    try {
      const [versionsRes, mappingsRes] = await Promise.all([
        fetch('/api/audio-versions'),
        fetch('/api/audio-mappings')
      ]);
      if (versionsRes.ok) {
        inMemoryVersionsCache = await versionsRes.json();
      }
      if (mappingsRes.ok) {
        inMemoryActiveMappingsCache = await mappingsRes.json();
      }
    } catch (e) {
      console.warn('Failed to init audio storage from server:', e);
    }

    if (!inMemoryVersionsCache) inMemoryVersionsCache = [];
    
    if (!inMemoryActiveMappingsCache) {
      const keys = Object.keys(DEFAULT_NARRATION_SCRIPTS) as NarrationLocationKey[];
      const result: Record<NarrationLocationKey, string | null> = {} as any;
      keys.forEach((k) => (result[k] = null));
      inMemoryActiveMappingsCache = result;
    }

    await this.syncFromCloud();

    this.notifySubscribers();
  }

  static getAllVersions(): BlueAudioVersion[] {
    return inMemoryVersionsCache || [];
  }

  static getVersionsForLocation(locationKey: NarrationLocationKey): BlueAudioVersion[] {
    return this.getAllVersions().filter((v) => v.locationKey === locationKey);
  }

  static getActiveMappings(): Record<NarrationLocationKey, string | null> {
    if (inMemoryActiveMappingsCache) return inMemoryActiveMappingsCache;
    const keys = Object.keys(DEFAULT_NARRATION_SCRIPTS) as NarrationLocationKey[];
    const result: Record<NarrationLocationKey, string | null> = {} as any;
    keys.forEach((k) => (result[k] = null));
    return result;
  }

  static getActiveVersion(locationKey: NarrationLocationKey): BlueAudioVersion | null {
    const activeMappings = this.getActiveMappings();
    const activeId = activeMappings[locationKey];
    const versions = this.getVersionsForLocation(locationKey);

    if (activeId) {
      const found = versions.find((v) => v.id === activeId);
      if (found) return found;
    }

    if (versions.length > 0) {
      const matched = versions.find((v) => v.isActive) || versions[versions.length - 1];
      if (matched && inMemoryActiveMappingsCache) {
        inMemoryActiveMappingsCache[locationKey] = matched.id;
      }
      return matched;
    }

    return null;
  }

  static saveVersion(version: BlueAudioVersion): void {
    const all = [...this.getAllVersions()];
    const index = all.findIndex((v) => v.id === version.id);
    if (index >= 0) {
      all[index] = version;
    } else {
      all.push(version);
    }
    inMemoryVersionsCache = all;

    const currentActive = this.getActiveMappings()[version.locationKey];
    if (version.isActive || !currentActive) {
      this.setActiveVersion(version.locationKey, version.id);
    } else {
      this.notifySubscribers();
    }
  }

  static setActiveVersion(locationKey: NarrationLocationKey, versionId: string): void {
    const mappings = { ...this.getActiveMappings() };
    mappings[locationKey] = versionId;

    if (locationKey.startsWith('blue_test_clock_')) {
      const selected = this.getAllVersions().find((v) => v.id === versionId);
      if (selected) {
        const targetVersionNum = selected.version;
        const clockKeys: NarrationLocationKey[] = ['blue_test_clock_slow', 'blue_test_clock_medium', 'blue_test_clock_urgent'];
        const allVers = this.getAllVersions();

        for (const ck of clockKeys) {
          const match = allVers.find((v) => v.locationKey === ck && v.version === targetVersionNum) || selected;
          mappings[ck] = match.id;
        }
      }
    }

    inMemoryActiveMappingsCache = mappings;

    const all = this.getAllVersions().map((v) => {
      if (locationKey.startsWith('blue_test_clock_') && v.locationKey.startsWith('blue_test_clock_')) {
        const activeId = mappings[v.locationKey as NarrationLocationKey];
        return { ...v, isActive: v.id === activeId };
      }
      if (v.locationKey === locationKey) {
        return { ...v, isActive: v.id === versionId };
      }
      return v;
    });
    inMemoryVersionsCache = all;

    fetch('/api/audio-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mappings)
    }).catch(console.warn);

    this.notifySubscribers();
  }

  static deleteVersion(versionId: string): void {
    const all = this.getAllVersions().filter((v) => v.id !== versionId);
    inMemoryVersionsCache = all;

    const mappings = { ...this.getActiveMappings() };
    for (const key of Object.keys(mappings) as NarrationLocationKey[]) {
      if (mappings[key] === versionId) {
        mappings[key] = null;
      }
    }
    inMemoryActiveMappingsCache = mappings;

    fetch(`/api/audio-versions/delete/${versionId}`, {
      method: 'POST'
    }).catch(console.warn);

    this.notifySubscribers();
  }

  static async clearAllVersions(): Promise<void> {
    inMemoryVersionsCache = [];
    const keys = Object.keys(DEFAULT_NARRATION_SCRIPTS) as NarrationLocationKey[];
    const result: Record<NarrationLocationKey, string | null> = {} as any;
    keys.forEach((k) => (result[k] = null));
    inMemoryActiveMappingsCache = result;

    try {
      await fetch('/api/audio-versions/clear-all', { method: 'POST' });
      await this.initFromServer();
    } catch (e) {
      console.warn('Failed to clear all audio versions on server:', e);
    }

    this.notifySubscribers();
  }

  static async syncStorageAudio(): Promise<{ syncedCount: number; message: string }> {
    try {
      const res = await fetch('/api/audio-storage/sync-bucket', { method: 'POST' });
      const data = await res.json();
      await this.initFromServer();
      this.notifySubscribers();
      return {
        syncedCount: data.syncedCount || 0,
        message: data.message || 'Synced storage audio successfully!',
      };
    } catch (e: any) {
      console.warn('Failed to sync storage audio:', e);
      throw new Error(e?.message || 'Failed to sync cloud storage audio.');
    }
  }

  static async verifyStorageMetadata(): Promise<AudioStorageVerificationReport> {
    try {
      const res = await fetch('/api/audio-storage/verify', { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      const data: AudioStorageVerificationReport = await res.json();
      return data;
    } catch (e: any) {
      console.warn('Failed to verify storage metadata:', e);
      throw new Error(e?.message || 'Failed to verify audio storage metadata against bucket.');
    }
  }
}
