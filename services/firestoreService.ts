import { 
  doc, 
  getDocs, 
  collection, 
  query, 
  where, 
  orderBy, 
  setDoc, 
  deleteDoc, 
  getDocFromServer,
  serverTimestamp,
  Timestamp,
  disableNetwork,
  enableNetwork
} from 'firebase/firestore';
import { db, auth } from './googleAuthService';
import type { AnalysisResult, TranscriptSegment } from '../types';
import { withExponentialBackoff } from './retryUtils';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export interface MeetingDocument {
  id: string;
  userId: string;
  createdAt: any;
  audioFileName: string | null;
  language: 'vi' | 'en';
  result: AnalysisResult;
  transcript: TranscriptSegment[];
}

const LOCAL_STORAGE_KEY = 'tridue_ai_meetings_v2';

const LEGACY_KEYS = [
  'tridue_ai_meetings_v2',
  'tridue_ai_meetings',
  'tridue_ai_meetings_v1',
  'ai_meeting_assistant_history',
  'ai_meeting_assistant_meetings',
  'meetings',
  'tridue_meetings',
  'meeting_history'
];

function parseDateMs(createdAt: any): number {
  if (!createdAt) return 0;
  if (typeof createdAt === 'number') return createdAt;
  if (typeof createdAt.toDate === 'function') {
    try { return createdAt.toDate().getTime(); } catch {}
  }
  if (typeof createdAt.seconds === 'number') {
    return createdAt.seconds * 1000;
  }
  const parsed = new Date(createdAt).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

// Local storage fallback helpers with legacy scanning and auto-migration
function getLocalMeetings(): MeetingDocument[] {
  const mergedMap = new Map<string, MeetingDocument>();

  // 1. Scan known legacy keys
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((m: any) => {
            if (m && (m.id || m.result || m.transcript)) {
              const id = m.id || ('m_legacy_' + Math.random().toString(36).substring(2, 9));
              if (!mergedMap.has(id)) {
                mergedMap.set(id, {
                  id,
                  userId: m.userId || 'local_user',
                  createdAt: m.createdAt || new Date().toISOString(),
                  audioFileName: m.audioFileName || null,
                  language: m.language || 'vi',
                  result: m.result || null,
                  transcript: m.transcript || []
                });
              }
            }
          });
        }
      }
    } catch (err) {
      console.warn(`Failed reading key ${key}:`, err);
    }
  }

  // 2. Scan all localStorage keys dynamically for any unmanaged meeting items
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !LEGACY_KEYS.includes(key) && key.toLowerCase().includes('meeting')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((m: any) => {
                if (m && (m.id || m.result)) {
                  const id = m.id || ('m_dyn_' + Math.random().toString(36).substring(2, 9));
                  if (!mergedMap.has(id)) {
                    mergedMap.set(id, {
                      id,
                      userId: m.userId || 'local_user',
                      createdAt: m.createdAt || new Date().toISOString(),
                      audioFileName: m.audioFileName || null,
                      language: m.language || 'vi',
                      result: m.result || null,
                      transcript: m.transcript || []
                    });
                  }
                }
              });
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn("Failed scanning dynamic localStorage keys:", err);
  }

  const resultList = Array.from(mergedMap.values());
  resultList.sort((a, b) => parseDateMs(b.createdAt) - parseDateMs(a.createdAt));
  return resultList;
}

function saveLocalMeetings(meetings: MeetingDocument[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(meetings));
  } catch (err) {
    console.warn("Failed to write local meetings:", err);
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
}

// 1. Helper with timeout
export function withFirestoreTimeout<T>(promise: Promise<T>, timeoutMs: number = 6000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Firestore operation timed out")), timeoutMs)
    )
  ]);
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await withFirestoreTimeout(getDocFromServer(doc(db, 'test', 'connection')), 4000);
    return true;
  } catch (error) {
    console.warn("Firestore connection check failed:", error);
    return false;
  }
}

export async function recoverFirestoreConnection(): Promise<void> {
  console.log("Starting Firestore network interface recovery...");
  try {
    await disableNetwork(db);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await enableNetwork(db);
    console.log("Firestore network interface recovery successful.");
  } catch (error) {
    console.warn("Failed to recover Firestore connection:", error);
  }
}

// 2. Save a new meeting analysis (Local First + Remote Sync)
export async function saveMeeting(
  meetingId: string,
  language: 'vi' | 'en',
  result: AnalysisResult,
  transcript: TranscriptSegment[],
  audioFileName: string | null = null
): Promise<void> {
  const userId = auth.currentUser?.uid || 'local_user';

  const newMeeting: MeetingDocument = {
    id: meetingId,
    userId,
    createdAt: new Date().toISOString(),
    audioFileName,
    language,
    result,
    transcript: transcript || []
  };

  // Step A: Save to LocalStorage immediately so user data is never lost
  const localList = getLocalMeetings();
  const existingIdx = localList.findIndex(m => m.id === meetingId);
  if (existingIdx >= 0) {
    localList[existingIdx] = newMeeting;
  } else {
    localList.unshift(newMeeting);
  }
  saveLocalMeetings(localList);

  // Step B: Attempt background sync to Firestore if logged in
  if (auth.currentUser?.uid) {
    const path = `meetings/${meetingId}`;
    try {
      const docRef = doc(db, 'meetings', meetingId);
      await withFirestoreTimeout(
        setDoc(docRef, {
          userId: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          language,
          result: result || null,
          transcript: transcript || [],
          audioFileName,
        }),
        8000
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

// 3. Retrieve all meetings for the user (Hybrid Local + Remote)
export async function getUserMeetings(): Promise<MeetingDocument[]> {
  const localList = getLocalMeetings();
  const userId = auth.currentUser?.uid;

  if (!userId) {
    return localList;
  }

  const path = 'meetings';
  try {
    const meetingsCollection = collection(db, 'meetings');
    // Query without orderBy to avoid requiring custom composite indexes in Firestore
    const q = query(
      meetingsCollection,
      where('userId', '==', userId)
    );

    const snapshot = await withFirestoreTimeout(getDocs(q), 8000);
    const remoteMeetings: MeetingDocument[] = [];
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      remoteMeetings.push({
        id: docSnap.id,
        userId: data.userId,
        createdAt: data.createdAt,
        audioFileName: data.audioFileName || null,
        language: data.language || 'vi',
        result: data.result as AnalysisResult,
        transcript: data.transcript as TranscriptSegment[],
      });
    });

    // Merge remote and local meetings seamlessly by ID
    const mergedMap = new Map<string, MeetingDocument>();
    // First insert local
    localList.forEach(m => mergedMap.set(m.id, m));
    // Remote updates or adds
    remoteMeetings.forEach(m => mergedMap.set(m.id, m));

    const mergedList = Array.from(mergedMap.values());
    mergedList.sort((a, b) => parseDateMs(b.createdAt) - parseDateMs(a.createdAt));

    saveLocalMeetings(mergedList);

    return mergedList;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return localList;
  }
}

// 4. Delete a meeting (Local + Remote)
export async function removeMeeting(meetingId: string): Promise<void> {
  // Always remove locally
  const localList = getLocalMeetings().filter(m => m.id !== meetingId);
  saveLocalMeetings(localList);

  // Attempt remote delete if logged in
  if (auth.currentUser?.uid) {
    const path = `meetings/${meetingId}`;
    try {
      const docRef = doc(db, 'meetings', meetingId);
      await withFirestoreTimeout(deleteDoc(docRef), 6000);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

