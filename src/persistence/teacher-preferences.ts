import { syncTeacherPreferencesClientSDK } from '../firebase';

export interface TeacherAudioSettings {
  autoplayTestIntro: boolean;
  autoplaySessionIntro: boolean;
  autoplayChallengeAudio: boolean;
  timerSoundEnabled: boolean;
  timerSoundVolume: number;
}

const DEFAULT_SETTINGS: TeacherAudioSettings = {
  autoplayTestIntro: false,
  autoplaySessionIntro: false,
  autoplayChallengeAudio: true, // Default to true based on previous Green Test? Will check below
  timerSoundEnabled: true,
  timerSoundVolume: 0.5
};

export class TeacherPreferencesService {
  static async getPreferences(): Promise<TeacherAudioSettings & { firestoreSynced?: boolean }> {
    try {
      const res = await fetch('/api/teacher-preferences');
      if (res.ok) {
        const data = await res.json();
        return { ...DEFAULT_SETTINGS, ...data };
      }
    } catch (e) {
      console.warn('Failed to load teacher preferences from backend', e);
      throw e;
    }
    return DEFAULT_SETTINGS;
  }

  static async savePreferences(prefs: Partial<TeacherAudioSettings>): Promise<{ firestoreSynced: boolean }> {
    const res = await fetch('/api/teacher-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs)
    });
    if (!res.ok) {
      throw new Error('Failed to save teacher preferences');
    }
    const data = await res.json();
    return { firestoreSynced: Boolean(data.firestoreSynced) };
  }

  static async syncNow(prefs: Partial<TeacherAudioSettings>): Promise<{ firestoreSynced: boolean; message: string }> {
    try {
      const res = await fetch('/api/sync-firestore', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.firestoreSynced) {
          return { firestoreSynced: true, message: data.message || 'Synced to Firestore successfully!' };
        }
      }
    } catch (e) {
      console.warn('Server sync endpoint failed, attempting Client Web SDK...', e);
    }

    // Client Web SDK fallback
    const clientSuccess = await syncTeacherPreferencesClientSDK(prefs);
    if (clientSuccess) {
      return { firestoreSynced: true, message: 'Synced directly via Firebase Client SDK!' };
    }

    return {
      firestoreSynced: false,
      message: 'Firestore sync failed (Permissions or network). Settings stored in local cache.'
    };
  }
}
