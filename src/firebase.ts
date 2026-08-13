import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {},
    operationType,
    path,
  };
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
}

export async function syncTeacherPreferencesClientSDK(prefs: Record<string, any>): Promise<boolean> {
  try {
    await setDoc(doc(db, 'blue_test_audio_settings', 'teacher_preferences'), prefs, { merge: true });
    console.log('[Firebase Client] Successfully synced teacher preferences via Client Web SDK.');
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'blue_test_audio_settings/teacher_preferences');
    return false;
  }
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firebase Client] Connection test executed successfully.');
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'test/connection');
  }
}

testConnection();

