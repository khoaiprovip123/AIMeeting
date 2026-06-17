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
  createdAt: Timestamp;
  audioFileName: string | null;
  language: 'vi' | 'en';
  result: AnalysisResult;
  transcript: TranscriptSegment[];
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
  console.error('Firestore Error Payload: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 1. Verify connection on mount with timeout
export function withFirestoreTimeout<T>(promise: Promise<T>, timeoutMs: number = 8000): Promise<T> {
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
    throw error;
  }
}

export async function recoverFirestoreConnection(): Promise<void> {
  console.log("Starting Firestore network interface recovery...");
  try {
    await disableNetwork(db);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await enableNetwork(db);
    console.log("Firestore network interface recovery successful.");
  } catch (error) {
    console.error("Failed to recover Firestore connection:", error);
    throw error;
  }
}

// 2. Save a new meeting analysis
export async function saveMeeting(
  meetingId: string,
  language: 'vi' | 'en',
  result: AnalysisResult,
  transcript: TranscriptSegment[],
  audioFileName: string | null = null
): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('User must be logged in to save meetings.');
  }

  const path = `meetings/${meetingId}`;
  try {
    const docRef = doc(db, 'meetings', meetingId);
    await withExponentialBackoff(
      () => withFirestoreTimeout(
        setDoc(docRef, {
          userId,
          createdAt: serverTimestamp(),
          language,
          result: result || null,
          transcript,
          audioFileName,
        }),
        8000
      ),
      { retries: 3, initialDelay: 1000, maxDelay: 6000 }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// 3. Retrieve all meetings for the logged-in user
export async function getUserMeetings(): Promise<MeetingDocument[]> {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    return [];
  }

  const path = 'meetings';
  try {
    const meetingsCollection = collection(db, 'meetings');
    const q = query(
      meetingsCollection,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await withFirestoreTimeout(getDocs(q), 8000);
    const meetings: MeetingDocument[] = [];
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      meetings.push({
        id: docSnap.id,
        userId: data.userId,
        createdAt: data.createdAt,
        audioFileName: data.audioFileName || null,
        language: data.language || 'vi',
        result: data.result as AnalysisResult,
        transcript: data.transcript as TranscriptSegment[],
      });
    });

    return meetings;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// 4. Delete a meeting
export async function removeMeeting(meetingId: string): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('User must be logged in to delete meetings.');
  }

  const path = `meetings/${meetingId}`;
  try {
    const docRef = doc(db, 'meetings', meetingId);
    await withExponentialBackoff(
      () => withFirestoreTimeout(deleteDoc(docRef), 8000),
      { retries: 3, initialDelay: 1000, maxDelay: 6000 }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
