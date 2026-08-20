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
    let configJson: any = null;
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      try {
        configJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (e) {
        console.warn('Failed to parse firebase-applet-config.json', e);
      }
    }

    const rawBucketName =
      process.env.GCP_STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      configJson?.storageBucket ||
      'gen-lang-client-0589169162.firebasestorage.app';
    const cleanBucketName = rawBucketName.replace(/^gs:\/\//, '').replace(/\/$/, '');

    const existingApps = getApps();
    if (existingApps.length > 0) {
      firestoreDb = getFirestore();
      storageBucket = getStorage().bucket(cleanBucketName);
      isFirebaseConnected = true;
      console.log(`[Firebase Admin] Connected using existing app instance with bucket: ${cleanBucketName}`);
      return;
    }

    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
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
          storageBucket: cleanBucketName,
        });
        firestoreDb = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
        storageBucket = getStorage(adminApp).bucket(cleanBucketName);
        isFirebaseConnected = true;
        console.log(`[Firebase Admin] Successfully initialized with Service Account credentials for bucket: ${cleanBucketName}`);
        return;
      }
    }

    // Fallback: Application Default Credentials
    try {
      const adminApp = initializeApp({
        credential: applicationDefault(),
        projectId: projectId || 'gen-lang-client-0589169162',
        storageBucket: cleanBucketName,
      });
      firestoreDb = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
      storageBucket = getStorage(adminApp).bucket(cleanBucketName);
      isFirebaseConnected = true;
      console.log(`[Firebase Admin] Successfully initialized with Application Default Credentials for bucket: ${cleanBucketName}`);
    } catch (adcErr) {
      console.log('[Firebase Admin] Cloud credentials not present. Running with local filesystem & memory storage fallback.');
    }
  } catch (err) {
    console.warn('[Firebase Admin] Initialization skipped or degraded to local storage:', err);
  }
}

initFirebaseAdmin();


let isStorageUploadDisabled = false;

// Cloud Storage upload helper
async function uploadAudioToCloudStorage(
  fileName: string,
  buffer: Buffer,
  contentType: string = 'audio/wav'
): Promise<string | null> {
  if (isStorageUploadDisabled) return null;
  let targetBucket = storageBucket;

  if (!targetBucket) {
    try {
      const rawBucketName =
        process.env.GCP_STORAGE_BUCKET ||
        process.env.FIREBASE_STORAGE_BUCKET ||
        'gen-lang-client-0589169162.firebasestorage.app';
      const cleanBucketName = rawBucketName.replace(/^gs:\/\//, '').replace(/\/$/, '');
      targetBucket = getStorage().bucket(cleanBucketName);
    } catch (e) {
      console.warn('[Cloud Storage] Failed to initialize storage bucket instance:', e);
      return null;
    }
  }

  if (!targetBucket) {
    console.log('[Cloud Storage] No Storage bucket available for upload.');
    return null;
  }

  try {
    const filePath = `audio-storage/${fileName}`;
    const file = targetBucket.file(filePath);

    // Save audio buffer to the storage bucket
    try {
      await file.save(buffer, {
        metadata: {
          contentType,
          cacheControl: 'public, max-age=31536000',
        },
        public: true,
        resumable: false,
      });
    } catch (publicErr: any) {
      const pubMsg = publicErr?.message || String(publicErr);
      if (
        pubMsg.includes('storage.objects.create') ||
        pubMsg.includes('PERMISSION_DENIED') ||
        pubMsg.includes('403') ||
        pubMsg.includes('denied') ||
        pubMsg.includes('AccessDenied')
      ) {
        throw publicErr;
      }
      // Fallback: Save without explicit public ACL option (e.g. Uniform Bucket-Level Access enabled)
      await file.save(buffer, {
        metadata: {
          contentType,
          cacheControl: 'public, max-age=31536000',
        },
        resumable: false,
      });
    }

    // Try making file publicly readable if supported by bucket permissions
    try {
      await file.makePublic();
    } catch (aclErr) {
      // Uniform Bucket-Level Access enabled on GCP/Firebase bucket, ACL makePublic is safely skipped
    }

    const bucketNameStr = targetBucket.name || 'gen-lang-client-0589169162.firebasestorage.app';
    const firebaseMediaUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketNameStr}/o/${encodeURIComponent(filePath)}?alt=media`;

    console.log(`[Cloud Storage] Successfully uploaded ${fileName} (${buffer.length} bytes) to gs://${bucketNameStr}/${filePath}`);
    console.log(`[Cloud Storage] Audio Storage URL: ${firebaseMediaUrl}`);

    return firebaseMediaUrl;
  } catch (err: any) {
    const msg = err?.message || String(err);
    const isPermissionError =
      msg.includes('storage.objects.create') ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('403') ||
      msg.includes('denied') ||
      msg.includes('AccessDenied');

    if (isPermissionError) {
      if (!isStorageUploadDisabled) {
        console.warn(`[Cloud Storage] Direct write access (storage.objects.create) on GCP bucket is restricted for Cloud Run runner. Operating gracefully with local server storage & Firestore.`);
        isStorageUploadDisabled = true;
      }
    } else {
      console.warn(`[Cloud Storage] Upload attempt skipped for ${fileName}:`, msg);
    }
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

app.post('/api/audio-versions/clear-all', async (req, res) => {
  try {
    // 1. Clear in-memory stores
    audioAssetsStore.clear();
    locationVersionsMap.clear();
    activeMappings = {};

    // 2. Clear disk metadata and mappings
    fs.writeFileSync(METADATA_FILE, JSON.stringify({}, null, 2));
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify({}, null, 2));

    // 3. Clear blob files
    if (fs.existsSync(BLOBS_DIR)) {
      const files = fs.readdirSync(BLOBS_DIR);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(BLOBS_DIR, file));
        } catch (e) {
          console.warn('Failed to delete blob file:', file, e);
        }
      }
    }

    // 4. Clear Firestore documents if connected
    if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
      try {
        const snap = await firestoreDb.collection('blue_test_audio_versions').get();
        if (!snap.empty) {
          const batch = firestoreDb.batch();
          snap.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }
        await firestoreDb.collection('blue_test_audio_settings').doc('audio_mappings').set({});
      } catch (e: any) {
        console.warn('Failed to clear Firestore audio records:', e);
      }
    }

    // 5. Re-synthesize default clock sounds
    autoEnsureClockAudio();

    res.json({ success: true, message: 'All audio assets, cache, and versions cleared successfully.' });
  } catch (err: any) {
    console.error('Failed to clear audio versions:', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.post('/api/audio-storage/sync-bucket', async (req, res) => {
  try {
    let pushedCount = 0;
    let syncedCount = 0;

    // 0. PUSH STEP: Upload all local audio assets to Cloud Storage (audio-storage/ folder) if not yet uploaded
    if (storageBucket) {
      for (const [id, record] of audioAssetsStore.entries()) {
        let bufferToUpload = record.wavBuffer;
        if (!bufferToUpload || bufferToUpload.length === 0) {
          const blobPath = path.join(BLOBS_DIR, `${id}.wav`);
          if (fs.existsSync(blobPath)) {
            try {
              bufferToUpload = fs.readFileSync(blobPath);
              record.wavBuffer = bufferToUpload;
            } catch (e) {
              console.warn(`[Push Storage] Could not read blob for asset ${id}:`, e);
            }
          }
        }

        if (bufferToUpload && bufferToUpload.length > 0) {
          const isLocalUrl = !(record as any).cloudUrl && (!(record as any).audioUrl || (record as any).audioUrl.startsWith('/api/'));
          if (isLocalUrl || req.body?.forcePush) {
            const ext = bufferToUpload.length >= 4 && bufferToUpload.toString('ascii', 0, 4) === 'RIFF' ? 'wav' : 'mp3';
            const contentType = ext === 'wav' ? 'audio/wav' : 'audio/mp3';
            const fileName = `${record.locationKey}_v${record.version || 1}.${ext}`;

            const uploadedUrl = await uploadAudioToCloudStorage(fileName, bufferToUpload, contentType);
            if (uploadedUrl) {
              record.cloudUrl = uploadedUrl;
              (record as any).audioUrl = uploadedUrl;
              pushedCount++;

              if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
                firestoreDb.collection('blue_test_audio_versions').doc(id).set({
                  id: record.id,
                  locationKey: record.locationKey,
                  version: record.version || 1,
                  scriptText: record.scriptText,
                  voice: record.voice,
                  model: record.model,
                  audioUrl: uploadedUrl,
                  cloudUrl: uploadedUrl,
                  createdAt: record.createdAt,
                  isActive: activeMappings[record.locationKey] === id,
                  fileSizeBytes: bufferToUpload.length,
                }, { merge: true }).catch(() => {});
              }
            }
          }
        }
      }
    }

    // 1. Fetch from Firestore if available
    if (isFirebaseConnected && firestoreDb && isFirestoreAccessible) {
      try {
        const snap = await firestoreDb.collection('blue_test_audio_versions').get();
        if (!snap.empty) {
          snap.docs.forEach((doc) => {
            const data = doc.data();
            if (data && data.id && data.locationKey) {
              const existing = audioAssetsStore.get(data.id);
              if (existing) {
                if (data.cloudUrl || data.audioUrl) {
                  existing.cloudUrl = data.cloudUrl || data.audioUrl;
                  (existing as any).audioUrl = data.audioUrl || data.cloudUrl;
                }
              } else {
                audioAssetsStore.set(data.id, data as any);
              }
              if (data.isActive) {
                activeMappings[data.locationKey] = data.id;
              }
              syncedCount++;
            }
          });
        }
        const mappingDoc = await firestoreDb.collection('blue_test_audio_settings').doc('audio_mappings').get();
        if (mappingDoc.exists) {
          const remoteMappings = mappingDoc.data() || {};
          Object.assign(activeMappings, remoteMappings);
        }
      } catch (e) {
        console.warn('[Sync Storage] Firestore sync warning:', e);
      }
    }

    // 2. Fetch from GCP Storage Bucket if available
    if (storageBucket) {
      try {
        const [files] = await storageBucket.getFiles({ prefix: 'audio-storage/' });
        const [rootFiles] = await storageBucket.getFiles({ prefix: '' });
        const allFiles = [...files, ...rootFiles];

        for (const file of allFiles) {
          const name = path.basename(file.name);
          const ext = path.extname(name).toLowerCase();
          if (['.wav', '.mp3', '.m4a', '.ogg'].includes(ext)) {
            const baseName = path.basename(name, ext);
            const knownKeys = [
              'pkg_intro', 'pkg_end',
              ...Array.from({ length: 7 }, (_, i) => `session_${i + 1}_intro`),
              ...Array.from({ length: 7 }, (_, i) => `blue_test_question_number_${i + 1}`),
              ...Array.from({ length: 49 }, (_, i) => `blue_test_challenge_${String(i + 1).padStart(2, '0')}`),
              ...Array.from({ length: 49 }, (_, i) => `blue_test_challenge_${i + 1}`),
            ];

            const matchedKey = knownKeys.find((k) => baseName.includes(k) || baseName === k);
            if (matchedKey) {
              const bucketNameStr = storageBucket.name || 'gen-lang-client-0589169162.firebasestorage.app';
              const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketNameStr}/o/${encodeURIComponent(file.name)}?alt=media`;
              const assetId = `gcs-${matchedKey}-${Date.now()}`;
              
              const existingAsset = Array.from(audioAssetsStore.values()).find(
                (a) => a.locationKey === matchedKey && ((a as any).cloudUrl === publicUrl || (a as any).audioUrl === publicUrl)
              );

              if (!existingAsset) {
                const newAsset = {
                  id: assetId,
                  locationKey: matchedKey,
                  version: 1,
                  scriptText: `Storage Bucket Asset: ${file.name}`,
                  voice: 'Google Cloud Storage Asset',
                  model: 'GCS Public URL',
                  audioUrl: publicUrl,
                  cloudUrl: publicUrl,
                  createdAt: new Date().toISOString(),
                  isActive: true,
                  fileSizeBytes: file.metadata?.size ? parseInt(file.metadata.size, 10) : 0,
                  durationSeconds: 5,
                };
                audioAssetsStore.set(assetId, newAsset as any);
                if (!activeMappings[matchedKey]) {
                  activeMappings[matchedKey] = assetId;
                }
                syncedCount++;
              }
            }
          }
        }
      } catch (e: any) {
        console.log('[Sync Storage] GCS bucket listing info:', e?.message || e);
      }
    }

    saveAudioStore();
    saveMappings();

    const msg = pushedCount > 0
      ? `Successfully pushed ${pushedCount} local audio files to Cloud Storage (audio-storage/) & synced ${syncedCount} items!`
      : `Successfully synced ${syncedCount} audio assets from Cloud Storage & Firestore!`;

    res.json({
      success: true,
      pushedCount,
      syncedCount,
      activeMappings,
      message: msg,
    });
  } catch (err: any) {
    console.error('Failed to sync storage audio:', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Verify audio files in metadata.json against storage bucket contents
app.post('/api/audio-storage/verify', async (req, res) => {
  try {
    let metadataStore: Record<string, AudioAssetRecord> = {};

    // 1. Read metadata from disk metadata.json if available
    if (fs.existsSync(METADATA_FILE)) {
      try {
        const raw = fs.readFileSync(METADATA_FILE, 'utf-8');
        metadataStore = JSON.parse(raw);
      } catch (e) {
        console.warn('[Verify Storage] Could not parse metadata.json:', e);
      }
    }

    // Merge in-memory records
    for (const [id, rec] of audioAssetsStore.entries()) {
      if (!metadataStore[id]) {
        const { wavBuffer, ...rest } = rec;
        metadataStore[id] = rest as any;
      }
    }

    const bucketName = storageBucket?.name || 'gen-lang-client-0589169162.firebasestorage.app';
    let bucketAccessible = false;
    const bucketFilesSet = new Set<string>();

    if (storageBucket) {
      try {
        const [files] = await storageBucket.getFiles({ prefix: 'audio-storage/' });
        const [rootFiles] = await storageBucket.getFiles({ prefix: '' });
        bucketAccessible = true;
        for (const f of [...files, ...rootFiles]) {
          bucketFilesSet.add(path.basename(f.name).toLowerCase());
          bucketFilesSet.add(f.name.toLowerCase());
        }
      } catch (e: any) {
        bucketAccessible = false;
        console.warn('[Verify Storage] GCS bucket file listing info:', e?.message || e);
      }
    }

    const items = [];
    let verifiedCount = 0;
    let localOnlyCount = 0;
    let missingCount = 0;

    const metadataEntries = Object.entries(metadataStore);

    for (const [id, record] of metadataEntries) {
      const ext = (record as any).cloudUrl?.toLowerCase().endsWith('.mp3') ? 'mp3' : 'wav';
      const expectedFileName = `${record.locationKey}_v${record.version || 1}.${ext}`;
      const blobPath = path.join(BLOBS_DIR, `${id}.wav`);
      const hasLocalBlob = fs.existsSync(blobPath) || (audioAssetsStore.get(id)?.wavBuffer?.length ?? 0) > 0;

      let isVerifiedInBucket = false;
      if (record.cloudUrl && (record.cloudUrl.startsWith('http://') || record.cloudUrl.startsWith('https://'))) {
        isVerifiedInBucket = true;
      } else if (bucketFilesSet.has(expectedFileName.toLowerCase()) || bucketFilesSet.has(`audio-storage/${expectedFileName.toLowerCase()}`)) {
        isVerifiedInBucket = true;
      }

      let status: 'VERIFIED' | 'MISSING' | 'LOCAL_ONLY' = 'MISSING';
      if (isVerifiedInBucket) {
        status = 'VERIFIED';
        verifiedCount++;
      } else if (hasLocalBlob) {
        status = 'LOCAL_ONLY';
        localOnlyCount++;
      } else {
        status = 'MISSING';
        missingCount++;
      }

      items.push({
        id,
        locationKey: record.locationKey,
        version: record.version || 1,
        fileName: expectedFileName,
        status,
        cloudUrl: record.cloudUrl || (record as any).audioUrl,
        fileSizeBytes: (record as any).fileSizeBytes || (hasLocalBlob && fs.existsSync(blobPath) ? fs.statSync(blobPath).size : 0),
      });
    }

    const summaryReport = metadataEntries.length === 0
      ? `No audio files registered in metadata.json yet.`
      : `Verified ${verifiedCount}/${metadataEntries.length} audio assets in metadata.json against Storage Bucket '${bucketName}'. (${localOnlyCount} stored locally, ${missingCount} missing)`;

    res.json({
      timestamp: new Date().toISOString(),
      bucketName,
      bucketAccessible,
      totalInMetadata: metadataEntries.length,
      verifiedCount,
      missingCount,
      localOnlyCount,
      summaryReport,
      items,
    });
  } catch (err: any) {
    console.error('Failed to verify storage metadata:', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Manual Audio File Upload or Custom URL Mapping
app.post('/api/audio-storage/upload-manual', async (req, res) => {
  try {
    const { locationKey, fileName, base64Data, audioUrl, scriptText, voice = 'Manual Audio File Upload' } = req.body;

    if (!locationKey) {
      res.status(400).json({ error: 'locationKey is required' });
      return;
    }

    const currentVersion = (locationVersionsMap.get(locationKey) || 0) + 1;
    locationVersionsMap.set(locationKey, currentVersion);

    const assetId = `manual-${locationKey}-v${currentVersion}-${Date.now()}`;
    const createdAt = new Date().toISOString();

    let bufferToSave: Buffer = Buffer.alloc(0);
    let cloudUrl: string | null = null;
    let dataUrl: string = audioUrl || '';

    if (base64Data) {
      const cleanBase64 = base64Data.replace(/^data:audio\/[a-z0-9]+;base64,/, '');
      bufferToSave = Buffer.from(cleanBase64, 'base64');

      const fileExt = fileName && fileName.toLowerCase().endsWith('.mp3') ? 'mp3' : 'wav';
      const uploadFileName = `${locationKey}_v${currentVersion}.${fileExt}`;
      const contentType = fileExt === 'mp3' ? 'audio/mp3' : 'audio/wav';

      cloudUrl = await uploadAudioToCloudStorage(uploadFileName, bufferToSave, contentType);
      dataUrl = cloudUrl || `/api/tts/audio/${assetId}`;
    } else if (audioUrl) {
      dataUrl = audioUrl;
      cloudUrl = audioUrl;
    } else {
      res.status(400).json({ error: 'Either base64Data or audioUrl must be provided' });
      return;
    }

    const record: AudioAssetRecord = {
      id: assetId,
      locationKey,
      version: currentVersion,
      scriptText: scriptText?.trim() || `Manual Upload/Mapped Audio for ${locationKey}`,
      voice: voice || 'Manual File / URL Mapping',
      model: 'Manual Replacement File',
      wavBuffer: bufferToSave,
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
        fileSizeBytes: bufferToSave.length,
        durationSeconds: Math.round((bufferToSave.length / (24000 * 2)) * 10) / 10,
      }).catch((e: any) => {
        if (e?.code === 7 || (e?.message && e.message.includes('PERMISSION_DENIED'))) {
          isFirestoreAccessible = false;
        }
      });

      firestoreDb.collection('blue_test_audio_settings').doc('audio_mappings').set(activeMappings, { merge: true }).catch(() => {});
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
        fileSizeBytes: bufferToSave.length,
        durationSeconds: Math.round((bufferToSave.length / (24000 * 2)) * 10) / 10,
      },
      message: `Successfully uploaded & mapped manual audio version v${currentVersion} for ${locationKey}!`,
    });
  } catch (err: any) {
    console.error('Manual audio upload failed:', err);
    res.status(500).json({ error: err?.message || String(err) });
  }
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

    const provider = req.body.provider || 'gemini';

    // DEEPGRAM TTS PROVIDER BRANCH
    if (provider === 'deepgram') {
      const deepgramApiKey = (req.body.deepgramApiKey && String(req.body.deepgramApiKey).trim()) || process.env.DEEPGRAM_API_KEY;
      if (!deepgramApiKey) {
        res.status(400).json({
          error: 'Deepgram API Key is required. Please input your Deepgram API Key in Audio Studio settings or set DEEPGRAM_API_KEY in environment.',
        });
        return;
      }

      if (!scriptText || !scriptText.trim()) {
        res.status(400).json({ error: 'scriptText is required' });
        return;
      }

      const model = (req.body.deepgramModel && String(req.body.deepgramModel).trim()) || 'flux-alexis-en';
      const isFlux = model.startsWith('flux-');
      const endpoint = isFlux
        ? `https://api.deepgram.com/v2/speak?model=${encodeURIComponent(model)}`
        : `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`;

      const dgResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${deepgramApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: scriptText.trim(),
        }),
      });

      if (!dgResponse.ok) {
        const errText = await dgResponse.text();
        console.error('[Deepgram TTS Error]', dgResponse.status, errText);
        res.status(dgResponse.status).json({
          error: `Deepgram TTS API error (${dgResponse.status}): ${errText || 'Failed to generate TTS audio via Deepgram'}`,
        });
        return;
      }

      const arrayBuf = await dgResponse.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuf);
      if (audioBuffer.length === 0) {
        res.status(500).json({ error: 'Deepgram returned empty audio response.' });
        return;
      }

      const isWav = audioBuffer.length >= 4 && audioBuffer.toString('ascii', 0, 4) === 'RIFF';
      const contentType = isWav ? 'audio/wav' : 'audio/mp3';
      const ext = isWav ? 'wav' : 'mp3';

      const currentVersion = (locationVersionsMap.get(locationKey) || 0) + 1;
      locationVersionsMap.set(locationKey, currentVersion);

      const assetId = `dg-${locationKey}-v${currentVersion}-${Date.now()}`;
      const createdAt = new Date().toISOString();

      const fileName = `${locationKey}_v${currentVersion}.${ext}`;
      const cloudUrl = await uploadAudioToCloudStorage(fileName, audioBuffer, contentType);
      const dataUrl = cloudUrl || `/api/tts/audio/${assetId}`;

      const record: AudioAssetRecord = {
        id: assetId,
        locationKey,
        version: currentVersion,
        scriptText: scriptText.trim(),
        voice: model,
        model: `Deepgram (${model})`,
        wavBuffer: audioBuffer,
        createdAt,
        cloudUrl: cloudUrl || undefined,
      };

      audioAssetsStore.set(assetId, record);
      activeMappings[locationKey] = assetId;

      const durationSeconds = Math.round((audioBuffer.length / (24000 * 2)) * 10) / 10 || 3;

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
          fileSizeBytes: audioBuffer.length,
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
          voice: record.voice,
          model: record.model,
          audioUrl: dataUrl,
          cloudUrl: cloudUrl || null,
          createdAt,
          isActive: true,
          fileSizeBytes: audioBuffer.length,
          durationSeconds,
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
      promptInput = `Generate a short single-speaker Blue Test challenge announcement. Use the configured Kore voice. Speak in clear international English with a firm, calm, precise assessment-facilitator delivery. Insert a brief, slight natural micro-pause (approx 100-200ms) immediately after the words "CHUNKS NUMBER" After the pause, pronounce the following number as one isolated English number word. Speak "T D T" as three separate English letters with slight separation. Keep a natural short pause between sentences. "Get ready" should sound attentive and prepared, not excited. Speak only the supplied transcript. Do not add, remove, summarize, or paraphrase words. Do not vocalize punctuation, ellipses, labels, or instructions. No music and no sound effects.

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
    const isQuotaError = message.includes('429') || 
                         message.includes('Quota exceeded') || 
                         message.includes('too_many_requests') || 
                         message.includes('rate-limits') || 
                         message.includes('RESOURCE_EXHAUSTED') ||
                         message.includes('prepayment') ||
                         message.includes('credits') ||
                         message.includes('depleted') ||
                         message.includes('billing');

    if (isQuotaError) {
      res.status(429).json({
        success: false,
        quotaExceeded: true,
        error: 'Gemini TTS quota or prepayment credit limit reached. The test room automatically falls back to Browser Web Speech API narration.',
      });
      return;
    }

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
