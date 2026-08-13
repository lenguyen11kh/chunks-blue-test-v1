import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { initializeApp, cert, applicationDefault, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// --- Firebase Admin & GCP Cloud Storage Setup ---
let firestoreDb: Firestore | null = null;
let storageBucket: any = null;
let isFirebaseConnected = false;
let isFirestoreAccessible = true;

function initFirebaseAdmin() {
  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      firestoreDb = getFirestore();
      storageBucket = getStorage().bucket();
      isFirebaseConnected = true;
      console.log('[Firebase Admin] Connected using existing app instance.');
      return;
    }

    let configJson: any = null;
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      try {
        configJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (e) {
        console.warn('Failed to parse firebase-applet-config.json', e);
      }
    }

    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    const bucketName = process.env.GCP_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || configJson?.storageBucket;
    const projectId = configJson?.projectId;
    const databaseId = configJson?.firestoreDatabaseId;

    if (serviceAccountStr && serviceAccountStr.trim()) {
      let serviceAccount: any;
      const trimmed = serviceAccountStr.trim();
      if (trimmed.startsWith('{')) {
        serviceAccount = JSON.parse(trimmed);
      } else if (fs.existsSync(trimmed)) {
        serviceAccount = JSON.parse(fs.readFileSync(trimmed, 'utf-8'));
      }

      if (serviceAccount) {
        const adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId: projectId || serviceAccount.project_id,
          storageBucket: bucketName || `${serviceAccount.project_id}.appspot.com`,
        });
        firestoreDb = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
        storageBucket = getStorage(adminApp).bucket(bucketName);
        isFirebaseConnected = true;
        console.log('[Firebase Admin] Successfully initialized with Service Account credentials.');
        return;
      }
    }

    // Fallback: Application Default Credentials
    try {
      const adminApp = initializeApp({
        credential: applicationDefault(),
        projectId: projectId,
        storageBucket: bucketName,
      });
      firestoreDb = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
      storageBucket = bucketName ? getStorage(adminApp).bucket(bucketName) : getStorage(adminApp).bucket();
      isFirebaseConnected = true;
      console.log('[Firebase Admin] Successfully initialized with Application Default Credentials.');
    } catch (adcErr) {
      console.log('[Firebase Admin] Cloud credentials not present. Running with local filesystem & memory storage fallback.');
    }
  } catch (err) {
    console.warn('[Firebase Admin] Initialization skipped or degraded to local storage:', err);
  }
}

initFirebaseAdmin();


// Cloud Storage upload helper
let isStorageAccessible = true;

async function uploadAudioToCloudStorage(
  fileName: string,
  buffer: Buffer,
  contentType: string = 'audio/wav'
): Promise<string | null> {
  if (!storageBucket || !isStorageAccessible) return null;
  try {
    const file = storageBucket.file(`audio-storage/${fileName}`);
    try {
      await file.save(buffer, {
        metadata: {
          contentType,
          cacheControl: 'public, max-age=31536000',
        },
        public: true,
      });
    } catch (publicErr) {
      // Fallback: Try saving without explicit public ACL (e.g. uniform bucket-level access enabled)
      await file.save(buffer, {
        metadata: {
          contentType,
          cacheControl: 'public, max-age=31536000',
        },
      });
    }
    const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/audio-storage/${fileName}`;
    console.log(`[Cloud Storage] Successfully uploaded audio to ${publicUrl}`);
    return publicUrl;
  } catch (err: any) {
    console.log(`[Cloud Storage] Upload skipped for ${fileName}. Operating with local audio storage.`);
    isStorageAccessible = false; // Disable further upload attempts to avoid GCS noise
    return null;
  }
}

// Firestore Collection sync helper
async function syncToFirestoreCollections(payload: Record<string, any>) {
  if (!firestoreDb || !isFirestoreAccessible) return;
  try {
    const batch = firestoreDb.batch();
    let opCount = 0;

    for (const [key, val] of Object.entries(payload)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && item.id) {
            const docRef = firestoreDb.collection(key).doc(String(item.id));
            batch.set(docRef, item, { merge: true });
            opCount++;
            if (opCount >= 450) {
              await batch.commit();
              opCount = 0;
            }
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        const docRef = firestoreDb.collection('blue_test_audio_settings').doc(key);
        batch.set(docRef, val, { merge: true });
        opCount++;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }
    console.log('[Firestore] Synced records to Firestore collections successfully.');
  } catch (err: any) {
    if (err?.code === 7 || (err?.message && err.message.includes('PERMISSION_DENIED'))) {
      if (isFirestoreAccessible) {
        isFirestoreAccessible = false;
        console.log('[Firestore] Service Account or ADC lacks Firestore IAM permissions. Operating with local data cache.');
      }
    } else {
      console.warn('[Firestore] Sync failed, local data remains preserved:', err?.message || err);
    }
  }
}

async function fetchAllFromFirestore(): Promise<Record<string, any> | null> {
  if (!firestoreDb || !isFirestoreAccessible) return null;
  try {
    const result: Record<string, any> = {};
    const collections = [
      'blue_test_learners',
      'blue_test_assignments',
      'blue_test_attempts',
      'blue_test_audit_events',
      'blue_test_runs',
      'blue_test_audio_settings',
    ];

    for (const collName of collections) {
      const snap = await firestoreDb.collection(collName).get();
      if (!snap.empty) {
        if (collName === 'blue_test_audio_settings') {
          const settingsObj: Record<string, any> = {};
          snap.forEach((doc) => {
            settingsObj[doc.id] = doc.data();
          });
          result[collName] = settingsObj;
        } else {
          result[collName] = snap.docs.map((doc) => doc.data());
        }
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch (err: any) {
    if (err?.code === 7 || (err?.message && err.message.includes('PERMISSION_DENIED'))) {
      if (isFirestoreAccessible) {
        isFirestoreAccessible = false;
        console.log('[Firestore] Service Account or ADC lacks Firestore IAM permissions. Operating with local data cache.');
      }
    } else {
      console.warn('[Firestore] Fetch failed, returning local cached dataset:', err?.message || err);
    }
    return null;
  }
}

// In-memory / filesystem audio asset cache
interface AudioAssetRecord {
  id: string;
  locationKey: string;
  version: number;
  scriptText: string;
  voice: string;
  model: string;
  wavBuffer: Buffer;
  createdAt: string;
  cloudUrl?: string;
}


const audioAssetsStore = new Map<string, AudioAssetRecord>();
const locationVersionsMap = new Map<string, number>();

function pcmToWav(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  // "RIFF"
  header.write('RIFF', 0);
  // ChunkSize = 36 + dataSize
  header.writeUInt32LE(36 + dataSize, 4);
  // "WAVE"
  header.write('WAVE', 8);
  // "fmt "
  header.write('fmt ', 12);
  // Subchunk1Size = 16
  header.writeUInt32LE(16, 16);
  // AudioFormat = 1 (PCM)
  header.writeUInt16LE(1, 20);
  // NumChannels = 1
  header.writeUInt16LE(numChannels, 22);
  // SampleRate = 24000
  header.writeUInt32LE(sampleRate, 24);
  // ByteRate = 24000 * 1 * 2 = 48000
  header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  // BlockAlign = 1 * 2 = 2
  header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  // BitsPerSample = 16
  header.writeUInt16LE(bitsPerSample, 34);
  // "data"
  header.write('data', 36);
  // Subchunk2Size = dataSize
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function createClockTickWav(bpm: number, style: 'woodblock' | 'digital' | 'pendulum' = 'woodblock'): Buffer {
  const sampleRate = 24000;
  const durationSeconds = 2; // 2 seconds seamless loop
  const totalSamples = sampleRate * durationSeconds;
  const pcmBuffer = Buffer.alloc(totalSamples * 2);

  const beatIntervalSamples = Math.max(1, Math.floor(sampleRate * (60 / bpm)));

  for (let i = 0; i < totalSamples; i++) {
    const sampleInBeat = i % beatIntervalSamples;
    const timeInBeat = sampleInBeat / sampleRate;
    const beatIndex = Math.floor(i / beatIntervalSamples);

    let sampleVal = 0;

    if (style === 'woodblock') {
      // Option 1: Classic Woodblock Tick pulse ~ 0.04s
      if (timeInBeat < 0.04) {
        const freq = (beatIndex % 2 === 0) ? 1350 : 950;
        const env = Math.exp(-timeInBeat * 140);
        const sineTone = Math.sin(2 * Math.PI * freq * timeInBeat);
        const clickTransient = timeInBeat < 0.004 ? (Math.random() * 2 - 1) * Math.exp(-timeInBeat * 900) : 0;
        const rawVal = (sineTone * 0.75 + clickTransient * 0.25) * env * 0.85;
        sampleVal = Math.max(-1, Math.min(1, rawVal));
      }
    } else if (style === 'digital') {
      // Option 2: Digital Quartz Beep ~ 0.03s
      if (timeInBeat < 0.03) {
        const freq = (beatIndex % 2 === 0) ? 2100 : 1750;
        const env = Math.exp(-timeInBeat * 180);
        const sqr = Math.sin(2 * Math.PI * freq * timeInBeat) > 0 ? 0.6 : -0.6;
        const sine = Math.sin(2 * Math.PI * freq * timeInBeat);
        const rawVal = (sqr * 0.4 + sine * 0.6) * env * 0.8;
        sampleVal = Math.max(-1, Math.min(1, rawVal));
      }
    } else if (style === 'pendulum') {
      // Option 3: Soft Pendulum Marimba ~ 0.06s
      if (timeInBeat < 0.06) {
        const freq = (beatIndex % 2 === 0) ? 880 : 660;
        const env = Math.exp(-timeInBeat * 70);
        const sineTone = Math.sin(2 * Math.PI * freq * timeInBeat) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * timeInBeat);
        const rawVal = sineTone * env * 0.65;
        sampleVal = Math.max(-1, Math.min(1, rawVal));
      }
    }

    const int16Val = Math.floor(sampleVal * 32767);
    pcmBuffer.writeInt16LE(int16Val, i * 2);
  }

  return pcmToWav(pcmBuffer, sampleRate, 1, 16);
}


// Persistent Storage setup
const STORAGE_DIR = path.join(process.cwd(), 'audio-storage');
const BLOBS_DIR = path.join(STORAGE_DIR, 'blobs');
const METADATA_FILE = path.join(STORAGE_DIR, 'metadata.json');
const MAPPINGS_FILE = path.join(STORAGE_DIR, 'mappings.json');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(BLOBS_DIR)) fs.mkdirSync(BLOBS_DIR, { recursive: true });

function loadAudioStore() {
  if (fs.existsSync(METADATA_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8')) as Record<string, AudioAssetRecord>;
      for (const [id, record] of Object.entries(data)) {
        // We do not load the buffer into memory here unless needed, or we just load it
        const blobPath = path.join(BLOBS_DIR, id + '.wav');
        if (fs.existsSync(blobPath)) {
           record.wavBuffer = fs.readFileSync(blobPath);
           audioAssetsStore.set(id, record);
           locationVersionsMap.set(record.locationKey, Math.max(locationVersionsMap.get(record.locationKey) || 0, record.version));
        }
      }
    } catch (e) {
      console.warn("Failed to load metadata", e);
    }
  }

  // Auto-fill activeMappings for any location key that has store assets but missing mapping
  let mappingUpdated = false;
  for (const record of audioAssetsStore.values()) {
    if (!activeMappings[record.locationKey]) {
      activeMappings[record.locationKey] = record.id;
      mappingUpdated = true;
    }
  }

  // Validate activeMappings against audioAssetsStore
  for (const [key, assetId] of Object.entries(activeMappings)) {
    if (assetId && !audioAssetsStore.has(assetId)) {
      const existing = Array.from(audioAssetsStore.values()).filter((v) => v.locationKey === key);
      if (existing.length > 0) {
        activeMappings[key] = existing[existing.length - 1].id;
      } else {
        activeMappings[key] = null;
      }
      mappingUpdated = true;
    }
  }

  if (mappingUpdated) {
    saveMappings();
  }
}

function saveAudioStore() {
  const data: Record<string, Omit<AudioAssetRecord, 'wavBuffer'>> = {};
  for (const [id, record] of audioAssetsStore.entries()) {
    const { wavBuffer, ...rest } = record;
    data[id] = rest;
    fs.writeFileSync(path.join(BLOBS_DIR, id + '.wav'), wavBuffer);
  }
  fs.writeFileSync(METADATA_FILE, JSON.stringify(data, null, 2));
}

let activeMappings: Record<string, string | null> = {};
if (fs.existsSync(MAPPINGS_FILE)) {
  try {
    activeMappings = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf-8'));
  } catch (e) { }
}

function saveMappings() {
  fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(activeMappings, null, 2));
}

function autoEnsureClockAudio() {
  const clockKeys = [
    { key: 'blue_test_clock_slow', bpm: 60, name: 'Slow (60 BPM)' },
    { key: 'blue_test_clock_medium', bpm: 120, name: 'Medium (120 BPM)' },
    { key: 'blue_test_clock_urgent', bpm: 240, name: 'Urgent (240 BPM)' },
  ];

  const styles: Array<{ style: 'woodblock' | 'digital' | 'pendulum'; label: string; optNum: number }> = [
    { style: 'woodblock', label: 'Option 1: Classic Woodblock Tick', optNum: 1 },
    { style: 'digital', label: 'Option 2: Digital Quartz Beep', optNum: 2 },
    { style: 'pendulum', label: 'Option 3: Soft Pendulum Chime', optNum: 3 },
  ];

  let modified = false;
  for (const { key, bpm, name } of clockKeys) {
    // Check existing versions for this location
    const existingVersions = Array.from(audioAssetsStore.values()).filter(v => v.locationKey === key);

    // Ensure all 3 option styles exist
    for (const { style, label, optNum } of styles) {
      const assetId = `clock-${key}-opt${optNum}`;
      if (!audioAssetsStore.has(assetId)) {
        const wavBuffer = createClockTickWav(bpm, style);
        const versionNum = optNum;
        locationVersionsMap.set(key, Math.max(locationVersionsMap.get(key) || 0, versionNum));

        const createdAt = new Date().toISOString();
        const record: AudioAssetRecord = {
          id: assetId,
          locationKey: key,
          version: versionNum,
          scriptText: `${label} - ${name}`,
          voice: `Clock Sound (${style})`,
          model: 'WebAudio Synth PCM',
          wavBuffer,
          createdAt,
        };

        audioAssetsStore.set(assetId, record);
        modified = true;

        // If no active mapping yet or Option 1, set as active default
        if (!activeMappings[key] || optNum === 1) {
          activeMappings[key] = assetId;
        }
      }
    }
  }

  if (modified) {
    saveAudioStore();
    saveMappings();
  }
}

loadAudioStore();
autoEnsureClockAudio();

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    isFirebaseConnected,
    hasStorageBucket: !!storageBucket,
  });
});

// --- Cloud DB & Storage Status & Control Endpoints ---
app.get('/api/cloud-db/status', (req, res) => {
  res.json({
    isCloudConnected: isFirebaseConnected,
    hasStorageBucket: !!storageBucket,
    storageBucketName: storageBucket?.name || null,
    collections: [
      'blue_test_learners',
      'blue_test_assignments',
      'blue_test_attempts',
      'blue_test_audio_settings',
      'blue_test_audio_versions',
      'blue_test_audit_events',
      'blue_test_runs',
    ],
  });
});

app.post('/api/cloud-db/sync', async (req, res) => {
  try {
    if (!isFirebaseConnected || !firestoreDb) {
      res.status(400).json({ error: 'Firebase Admin SDK is not connected. Check service account or GCP credentials.' });
      return;
    }
    const { action } = req.body;
    if (action === 'push') {
      await syncToFirestoreCollections(blueTestData);
      res.json({ success: true, message: 'Local dataset pushed to Firestore collections successfully.' });
    } else if (action === 'pull') {
      const fetched = await fetchAllFromFirestore();
      if (fetched) {
        blueTestData = { ...blueTestData, ...fetched };
        fs.writeFileSync(BLUE_TEST_DATA_FILE, JSON.stringify(blueTestData, null, 2));
        broadcastSyncData(blueTestData);
        res.json({ success: true, message: 'Pulled latest dataset from Firestore collections.', data: blueTestData });
      } else {
        res.json({ success: true, message: 'Firestore collections were empty. Preserved local dataset.' });
      }
    } else {
      res.status(400).json({ error: "Invalid action. Use 'push' or 'pull'." });
    }
  } catch (err: any) {
    console.error('Cloud DB Sync error:', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post('/api/cloud-storage/upload', async (req, res) => {
  try {
    const { fileName, fileBufferBase64, contentType = 'audio/wav' } = req.body;
    if (!fileName || !fileBufferBase64) {
      res.status(400).json({ error: 'fileName and fileBufferBase64 are required.' });
      return;
    }
    const buffer = Buffer.from(fileBufferBase64, 'base64');
    const cloudUrl = await uploadAudioToCloudStorage(fileName, buffer, contentType);
    if (cloudUrl) {
      res.json({ success: true, publicUrl: cloudUrl });
    } else {
      res.status(500).json({ error: 'Failed to upload file to Cloud Storage bucket. Operating with local fallback.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// --- Teacher Preferences ---
const PREFERENCES_FILE = path.join(STORAGE_DIR, 'teacher-preferences.json');
let teacherPreferences = {};
if (fs.existsSync(PREFERENCES_FILE)) {
  try {
    teacherPreferences = JSON.parse(fs.readFileSync(PREFERENCES_FILE, 'utf-8'));
  } catch (e) {
    console.warn("Failed to load teacher preferences", e);
  }
}

app.get('/api/teacher-preferences', async (req, res) => {
  let firestoreSynced = false;
  if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
    try {
      const doc = await firestoreDb.collection('blue_test_audio_settings').doc('teacher_preferences').get();
      if (doc.exists) {
        teacherPreferences = { ...teacherPreferences, ...doc.data() };
      }
      firestoreSynced = true;
    } catch (e: any) {
      if (e?.code === 7 || (e?.message && e.message.includes('PERMISSION_DENIED'))) {
        if (isFirestoreAccessible) {
          isFirestoreAccessible = false;
          console.log('[Firestore] Teacher preferences read bypassed due to IAM permissions. Using local cache.');
        }
      } else {
        console.warn('Failed to fetch teacher preferences from Firestore:', e?.message || e);
      }
    }
  }
  res.json({ ...teacherPreferences, firestoreSynced });
});

app.post('/api/teacher-preferences', async (req, res) => {
  teacherPreferences = { ...teacherPreferences, ...req.body };
  fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(teacherPreferences, null, 2));

  let firestoreSynced = false;
  if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
    try {
      await firestoreDb.collection('blue_test_audio_settings').doc('teacher_preferences').set(teacherPreferences, { merge: true });
      firestoreSynced = true;
    } catch (e: any) {
      if (e?.code === 7 || (e?.message && e.message.includes('PERMISSION_DENIED'))) {
        isFirestoreAccessible = false;
      }
      console.warn('[Firestore] Syncing teacher preferences to Firestore failed, stored locally:', e?.message || e);
    }
  }

  res.json({ success: true, firestoreSynced });
});

app.post('/api/sync-firestore', async (req, res) => {
  isFirestoreAccessible = true;
  if (!isFirebaseConnected) {
    initFirebaseAdmin();
  }

  let teacherPrefsSynced = false;
  let dataSynced = false;
  let errorMessage: string | null = null;

  if (isFirebaseConnected && firestoreDb) {
    try {
      await firestoreDb.collection('blue_test_audio_settings').doc('teacher_preferences').set(teacherPreferences, { merge: true });
      teacherPrefsSynced = true;
    } catch (e: any) {
      errorMessage = e?.message || String(e);
      if (e?.code === 7 || errorMessage?.includes('PERMISSION_DENIED')) {
        isFirestoreAccessible = false;
      }
    }

    if (isFirestoreAccessible) {
      try {
        await syncToFirestoreCollections(blueTestData);
        dataSynced = true;
      } catch (e: any) {
        if (!errorMessage) errorMessage = e?.message || String(e);
      }
    }
  } else {
    errorMessage = "Firebase Admin SDK not initialized or missing service account credentials.";
  }

  const overallSuccess = teacherPrefsSynced || dataSynced;
  res.json({
    success: overallSuccess,
    firestoreSynced: overallSuccess,
    teacherPrefsSynced,
    dataSynced,
    error: overallSuccess ? null : errorMessage,
    message: overallSuccess 
      ? "Successfully synced teacher preferences and test data with Cloud Firestore!" 
      : (errorMessage || "Sync failed. Operating in local storage mode.")
  });
});

// --- Blue Test Data Storage ---
const wsClients = new Set<WebSocket>();

function broadcastSyncData(data: Record<string, any>, senderWs?: WebSocket) {
  const payloadStr = JSON.stringify({ type: 'DATA_UPDATED', payload: data });
  for (const client of wsClients) {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      try {
        client.send(payloadStr);
      } catch (e) {
        console.warn('WS broadcast error', e);
      }
    }
  }
}

const BLUE_TEST_DATA_FILE = path.join(STORAGE_DIR, 'blue-test-data.json');
const DEFAULT_LEARNERS = [
  {
    id: 'learner-1',
    name: 'Lucy',
    code: 'L-6446',
    grade: 'Grade 3A',
    isActive: true,
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=L-6446',
  },
  {
    id: 'learner-2',
    name: 'Max',
    code: 'L-8821',
    grade: 'Grade 3B',
    isActive: true,
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=L-8821',
  },
  {
    id: 'learner-3',
    name: 'Alex',
    code: 'L-3104',
    grade: 'Grade 4A',
    isActive: true,
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=L-3104',
  },
];

let blueTestData: Record<string, any> = {};
if (fs.existsSync(BLUE_TEST_DATA_FILE)) {
  try {
    blueTestData = JSON.parse(fs.readFileSync(BLUE_TEST_DATA_FILE, 'utf-8'));
  } catch (e) {
    console.warn("Failed to load blue test data", e);
  }
}

if (!blueTestData.blue_test_learners || !Array.isArray(blueTestData.blue_test_learners) || blueTestData.blue_test_learners.length === 0) {
  blueTestData.blue_test_learners = DEFAULT_LEARNERS;
  try {
    fs.writeFileSync(BLUE_TEST_DATA_FILE, JSON.stringify(blueTestData, null, 2));
  } catch (e) {
    console.warn("Failed to seed default learners", e);
  }
}

app.get('/api/blue-test-data', async (req, res) => {
  if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
    const firestoreData = await fetchAllFromFirestore();
    if (firestoreData) {
      blueTestData = { ...blueTestData, ...firestoreData };
    }
  }
  res.json(blueTestData);
});

app.post('/api/blue-test-data', async (req, res) => {
  try {
    blueTestData = { ...blueTestData, ...req.body };
    fs.writeFileSync(BLUE_TEST_DATA_FILE, JSON.stringify(blueTestData, null, 2));
    broadcastSyncData(req.body);

    if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
      syncToFirestoreCollections(req.body).catch(console.warn);
    }

    res.json({ success: true, cloudSynced: isFirebaseConnected && isFirestoreAccessible });
  } catch (e) {
    console.error("Failed to write blue test data", e);
    res.status(500).json({ error: "Failed to persist blue test data" });
  }
});

// Audio Storage API
app.get('/api/cloud-audio-versions', async (req, res) => {
  try {
    let cloudVersions: any[] = [];
    let cloudMappings: Record<string, string | null> = {};

    if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
      try {
        const snap = await firestoreDb.collection('blue_test_audio_versions').get();
        if (!snap.empty) {
          cloudVersions = snap.docs.map((doc) => doc.data());
        }
        const mappingDoc = await firestoreDb.collection('blue_test_audio_settings').doc('audio_mappings').get();
        if (mappingDoc.exists) {
          cloudMappings = mappingDoc.data() || {};
        }
      } catch (e: any) {
        if (e?.code === 7 || (e?.message && e.message.includes('PERMISSION_DENIED'))) {
          if (isFirestoreAccessible) {
            isFirestoreAccessible = false;
            console.log('[Firestore] Cloud audio versions read bypassed due to IAM permissions. Operating with local store.');
          }
        } else {
          console.warn('[Firestore] Failed to fetch cloud audio versions:', e?.message || e);
        }
      }
    }

    // Fallback/Supplement with local disk store if cloud was empty or offline
    if (cloudVersions.length === 0) {
      for (const [id, record] of audioAssetsStore.entries()) {
        cloudVersions.push({
          id: record.id,
          locationKey: record.locationKey,
          version: record.version,
          scriptText: record.scriptText,
          voice: record.voice,
          model: record.model,
          audioUrl: record.cloudUrl || `/api/tts/audio/${record.id}`,
          cloudUrl: record.cloudUrl,
          createdAt: record.createdAt,
          isActive: activeMappings[record.locationKey] === record.id,
          fileSizeBytes: record.wavBuffer.length,
          durationSeconds: Math.round((record.wavBuffer.length / (24000 * 2)) * 10) / 10,
        });
      }
    }

    if (Object.keys(cloudMappings).length === 0) {
      cloudMappings = { ...activeMappings };
    }

    res.json({
      versions: cloudVersions,
      activeMappings: cloudMappings,
      isCloudConnected: isFirebaseConnected && isFirestoreAccessible,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get('/api/audio-versions', (req, res) => {
  const versions = [];
  for (const [id, record] of audioAssetsStore.entries()) {
    versions.push({
      id: record.id,
      locationKey: record.locationKey,
      version: record.version,
      scriptText: record.scriptText,
      voice: record.voice,
      model: record.model,
      audioUrl: record.cloudUrl || `/api/tts/audio/${record.id}`,
      cloudUrl: record.cloudUrl,
      createdAt: record.createdAt,
      isActive: activeMappings[record.locationKey] === record.id,
      fileSizeBytes: record.wavBuffer.length,
      durationSeconds: Math.round((record.wavBuffer.length / (24000 * 2)) * 10) / 10
    });
  }
  res.json(versions);
});

app.get('/api/audio-mappings', (req, res) => {
  res.json(activeMappings);
});

app.post('/api/audio-mappings', (req, res) => {
  activeMappings = req.body;
  saveMappings();

  if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
    firestoreDb.collection('blue_test_audio_settings').doc('audio_mappings').set(activeMappings, { merge: true }).catch((e: any) => {
      if (e?.code === 7 || (e?.message && e.message.includes('PERMISSION_DENIED'))) {
        isFirestoreAccessible = false;
      }
    });
  }

  res.json({ success: true });
});

app.post('/api/audio-versions/delete/:id', async (req, res) => {
  const id = req.params.id;
  if (audioAssetsStore.has(id)) {
    const record = audioAssetsStore.get(id);
    audioAssetsStore.delete(id);
    const blobPath = path.join(BLOBS_DIR, id + '.wav');
    if (fs.existsSync(blobPath)) fs.unlinkSync(blobPath);
    saveAudioStore();
    for (const [k, v] of Object.entries(activeMappings)) {
      if (v === id) {
        activeMappings[k] = null;
      }
    }
    saveMappings();

    if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
      firestoreDb.collection('blue_test_audio_versions').doc(id).delete().catch((e: any) => {
        if (e?.code === 7 || (e?.message && e.message.includes('PERMISSION_DENIED'))) {
          isFirestoreAccessible = false;
        }
      });
    }
    if (storageBucket && record?.locationKey && record?.version) {
      const file = storageBucket.file(`audio-storage/${record.locationKey}_v${record.version}.wav`);
      file.delete().catch(() => {});
    }
  }
  res.json({ success: true });
});



// Serve audio binary
app.get('/api/tts/audio/:id', (req, res) => {
  const asset = audioAssetsStore.get(req.params.id);
  if (!asset) {
    res.status(404).json({ error: 'Audio asset not found' });
    return;
  }
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Length', asset.wavBuffer.length);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(asset.wavBuffer);
});

// Generate TTS Audio via server-side Gemini Interactions API
app.post('/api/tts/generate', async (req, res) => {
  try {
    const { locationKey, scriptText, voice = 'Kore' } = req.body;

    if (!locationKey) {
      res.status(400).json({ error: 'locationKey is required' });
      return;
    }

    // Intercept Clock Sound Locations - Self-synthesize PCM WAV instead of Gemini TTS
    if (locationKey.startsWith('blue_test_clock_')) {
      let bpm = 60;
      if (locationKey.includes('medium')) bpm = 120;
      if (locationKey.includes('urgent')) bpm = 240;

      const styleParam = req.body.style as 'woodblock' | 'digital' | 'pendulum' | undefined;
      const optIndex = req.body.optionIndex ? Number(req.body.optionIndex) : undefined;

      let style: 'woodblock' | 'digital' | 'pendulum' = 'woodblock';
      if (styleParam && ['woodblock', 'digital', 'pendulum'].includes(styleParam)) {
        style = styleParam;
      } else if (optIndex === 2) {
        style = 'digital';
      } else if (optIndex === 3) {
        style = 'pendulum';
      } else {
        const existingCount = Array.from(audioAssetsStore.values()).filter(v => v.locationKey === locationKey).length;
        if (existingCount % 3 === 1) style = 'digital';
        else if (existingCount % 3 === 2) style = 'pendulum';
      }

      const styleLabel = style === 'woodblock' ? 'Option 1: Classic Woodblock Tick' : style === 'digital' ? 'Option 2: Digital Quartz Beep' : 'Option 3: Soft Pendulum Chime';

      const wavBuffer = createClockTickWav(bpm, style);
      const currentVersion = (locationVersionsMap.get(locationKey) || 0) + 1;
      locationVersionsMap.set(locationKey, currentVersion);

      const assetId = `clock-${locationKey}-v${currentVersion}-${Date.now()}`;
      const createdAt = new Date().toISOString();

      const fileName = `${locationKey}_v${currentVersion}.wav`;
      const cloudUrl = await uploadAudioToCloudStorage(fileName, wavBuffer, 'audio/wav');
      const dataUrl = cloudUrl || `/api/tts/audio/${assetId}`;

      const record: AudioAssetRecord = {
        id: assetId,
        locationKey,
        version: currentVersion,
        scriptText: (scriptText && scriptText.trim()) || `${styleLabel} (${bpm} BPM)`,
        voice: `Clock Sound (${style})`,
        model: 'WebAudio Synth PCM',
        wavBuffer,
        createdAt,
        cloudUrl: cloudUrl || undefined,
      };

      audioAssetsStore.set(assetId, record);
      activeMappings[locationKey] = assetId;
      saveAudioStore();
      saveMappings();

      if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
        firestoreDb.collection('blue_test_audio_versions').doc(assetId).set({
          id: assetId,
          locationKey,
          version: currentVersion,
          scriptText: record.scriptText,
          voice: record.voice,
          model: record.model,
          audioUrl: dataUrl,
          cloudUrl: cloudUrl || null,
          createdAt,
          isActive: true,
          fileSizeBytes: wavBuffer.length,
          durationSeconds: 2,
        }).catch((e: any) => {
          if (e?.code === 7 || (e?.message && e.message.includes('PERMISSION_DENIED'))) {
            isFirestoreAccessible = false;
          }
        });
      }

      res.json({
        success: true,
        asset: {
          id: assetId,
          locationKey,
          version: currentVersion,
          scriptText: record.scriptText,
          voice: record.voice,
          model: record.model,
          audioUrl: dataUrl,
          cloudUrl: cloudUrl || null,
          createdAt,
          isActive: true,
          fileSizeBytes: wavBuffer.length,
          durationSeconds: 2,
        },
      });
      return;
    }

    if (!scriptText || !scriptText.trim()) {
      res.status(400).json({ error: 'scriptText is required' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: 'GEMINI_API_KEY environment variable is missing on the server',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const modelName = 'gemini-3.1-flash-tts-preview';

    let promptInput = scriptText.trim();
    if (locationKey.startsWith('blue_test_challenge_')) {
      promptInput = `Generate a short single-speaker Blue Test challenge announcement. Use the configured Kore voice. Speak in clear international English with a firm, calm, precise assessment-facilitator delivery. Insert a brief, slight natural micro-pause (approx 100-200ms) immediately after the words "CHUNKS NUMBER" After the pause, pronounce the following number as one isolated English number word. Speak "T C T" as three separate English letters with slight separation. Keep a natural short pause between sentences. "Get ready" should sound attentive and prepared, not excited. Speak only the supplied transcript. Do not add, remove, summarize, or paraphrase words. Do not vocalize punctuation, ellipses, labels, or instructions. No music and no sound effects.

BEGIN_TRANSCRIPT
${scriptText.trim()}
END_TRANSCRIPT`;
    } else if (locationKey.startsWith('blue_test_question_number_')) {
      promptInput = `Generate a short single-speaker test question-number cue.

VOICE:
Use the configured Kore voice.

DELIVERY:
- Firm, clear, calm, and concise.
- International English.
- Moderate pace.
- Precise pronunciation.
- No music.
- No sound effects.
- No extra words.
- Speak only the text between BEGIN_TRANSCRIPT and END_TRANSCRIPT.
- Never read these instructions aloud.

BEGIN_TRANSCRIPT
${scriptText.trim()}
END_TRANSCRIPT`;
    } else {
      promptInput = `Read aloud the following official educational test introduction transcript using the configured voice:

BEGIN_TRANSCRIPT
${scriptText.trim()}
END_TRANSCRIPT`;
    }

    const interaction = await ai.interactions.create({
      model: modelName,
      input: promptInput,
      response_format: {
        type: 'audio',
      },
      generation_config: {
        speech_config: [
          {
            voice,
          },
        ],
      },
    });

    let base64Audio: string | undefined;

    if (interaction.output_audio && interaction.output_audio.data) {
      base64Audio = interaction.output_audio.data;
    } else if (interaction.steps) {
      for (const step of interaction.steps) {
        if (step.type === 'model_output' && step.content) {
          for (const item of step.content) {
            if (item.type === 'audio' && item.data) {
              base64Audio = item.data;
              break;
            }
          }
        }
      }
    }

    if (!base64Audio) {
      res.status(500).json({ error: 'Gemini TTS did not return audio data' });
      return;
    }

    const pcmBuffer = Buffer.from(base64Audio, 'base64');
    const isWav = pcmBuffer.length >= 4 && pcmBuffer.toString('ascii', 0, 4) === 'RIFF';
    const wavBuffer = isWav ? pcmBuffer : pcmToWav(pcmBuffer);

    const currentVersion = (locationVersionsMap.get(locationKey) || 0) + 1;
    locationVersionsMap.set(locationKey, currentVersion);

    const assetId = `tts-${locationKey}-v${currentVersion}-${Date.now()}`;
    const createdAt = new Date().toISOString();

    const fileName = `${locationKey}_v${currentVersion}.wav`;
    const cloudUrl = await uploadAudioToCloudStorage(fileName, wavBuffer, 'audio/wav');
    const dataUrl = cloudUrl || `/api/tts/audio/${assetId}`;

    const record: AudioAssetRecord = {
      id: assetId,
      locationKey,
      version: currentVersion,
      scriptText: scriptText.trim(),
      voice,
      model: modelName,
      wavBuffer,
      createdAt,
      cloudUrl: cloudUrl || undefined,
    };

    audioAssetsStore.set(assetId, record);
    activeMappings[locationKey] = assetId;

    const durationSeconds = Math.round((pcmBuffer.length / (24000 * 2)) * 10) / 10;

    saveAudioStore();
    saveMappings();

    if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
      firestoreDb.collection('blue_test_audio_versions').doc(assetId).set({
        id: assetId,
        locationKey,
        version: currentVersion,
        scriptText: record.scriptText,
        voice: record.voice,
        model: record.model,
        audioUrl: dataUrl,
        cloudUrl: cloudUrl || null,
        createdAt,
        isActive: true,
        fileSizeBytes: wavBuffer.length,
        durationSeconds,
      }).catch((e: any) => {
        if (e?.code === 7 || (e?.message && e.message.includes('PERMISSION_DENIED'))) {
          isFirestoreAccessible = false;
        }
      });
    }

    res.json({
      success: true,
      asset: {
        id: assetId,
        locationKey,
        version: currentVersion,
        scriptText: scriptText.trim(),
        voice,
        model: modelName,
        audioUrl: dataUrl,
        cloudUrl: cloudUrl || null,
        createdAt,
        isActive: true,
        fileSizeBytes: wavBuffer.length,
        durationSeconds,
      },
    });

  } catch (err: unknown) {
    console.error('Error generating Gemini TTS:', err);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Gemini TTS Generation Failed: ${message}` });
  }
});

async function startServer() {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws) => {
    wsClients.add(ws);

    try {
      ws.send(JSON.stringify({ type: 'INIT', payload: blueTestData }));
    } catch (e) {
      console.warn('WS init send error', e);
    }

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());
        if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG' }));
        } else if (msg.type === 'UPDATE_DATA' && msg.payload) {
          blueTestData = { ...blueTestData, ...msg.payload };
          try {
            fs.writeFileSync(BLUE_TEST_DATA_FILE, JSON.stringify(blueTestData, null, 2));
          } catch (e) {
            console.warn('Failed to write blue test data from WS', e);
          }
          broadcastSyncData(msg.payload, ws);
        }
      } catch (e) {
        console.warn('WS message error', e);
      }
    });

    ws.on('close', () => {
      wsClients.delete(ws);
    });

    ws.on('error', () => {
      wsClients.delete(ws);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || 'localhost';
      const url = new URL(request.url || '', `http://${host}`);
      if (url.pathname === '/ws/sync') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch (e) {
      // Ignore non-sync upgrades
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
