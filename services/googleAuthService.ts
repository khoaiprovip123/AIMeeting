import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { AnalysisResult } from '../types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Explicitly ensure standard local session persistence is enabled to survive reloads/refreshes cleanly
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Firebase auth setPersistence failed: ", err);
});
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/gmail.compose');
provider.addScope('https://www.googleapis.com/auth/drive');
provider.setCustomParameters({
  prompt: 'select_account'
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = cachedAccessToken || localStorage.getItem('google_access_token');
      if (token) {
        cachedAccessToken = token;
      }
      if (onAuthSuccess) onAuthSuccess(user, token);
    } else {
      cachedAccessToken = null;
      localStorage.removeItem('google_access_token');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google');
    }
    cachedAccessToken = credential.accessToken;
    localStorage.setItem('google_access_token', cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Core sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const emailSignIn = async (email: string, pass: string): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  return result.user;
};

export const emailSignUp = async (email: string, pass: string, displayName: string): Promise<User> => {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (displayName && result.user) {
    await updateProfile(result.user, { displayName });
  }
  return result.user;
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken) {
    cachedAccessToken = localStorage.getItem('google_access_token');
  }
  return cachedAccessToken;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  localStorage.removeItem('google_access_token');
};

// Help convert markdown to formatted HTML in email
function markdownToHtml(md: string): string {
  if (!md) return '';
  let inList = false;
  const lines = md.split('\n');
  const renderedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      let heading = `<h3 style="font-size: 16px; font-weight: bold; color: #0284c7; margin-top: 22px; margin-bottom: 8px; font-family: 'Segoe UI', Arial, sans-serif;">${trimmed.substring(3)}</h3>`;
      if (inList) {
        heading = '</ul>' + heading;
        inList = false;
      }
      return heading;
    }
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      let listItem = `<li style="margin-bottom: 6px; line-height: 1.6; color: #334155; font-size: 14px;">${trimmed.substring(2)}</li>`;
      if (!inList) {
        listItem = '<ul style="margin: 8px 0 16px 20px; padding: 0;">' + listItem;
        inList = true;
      }
      return listItem;
    }
    
    if (inList && trimmed) {
      // Just some blank or mid line breaking the list
      return '</ul>' + `<p style="line-height: 1.6; margin-bottom: 12px; color: #334155; font-size: 14px;">${trimmed}</p>`;
    }
    
    if (inList) {
      inList = false;
      return '</ul>';
    }

    if (!trimmed) return '';
    return `<p style="line-height: 1.6; margin-bottom: 12px; color: #334155; font-size: 14px;">${trimmed}</p>`;
  });

  if (inList) {
    renderedLines.push('</ul>');
  }

  return renderedLines.join('\n');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (result) {
        const base64 = result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error("Failed to read blob as Base64"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function buildMimeMessage(
  subject: string,
  htmlBody: string,
  docxBlob?: Blob,
  docxFileName?: string
): Promise<string> {
  const boundary = "==_Boundary_Partition_" + Math.random().toString(36).substring(2, 11) + "==";
  const subjectEncoded = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  let parts = [
    `Subject: ${subjectEncoded}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="utf-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(htmlBody))),
  ];

  if (docxBlob && docxFileName) {
    const base64Docx = await blobToBase64(docxBlob);
    const base64Chunked = base64Docx.match(/.{1,76}/g)?.join("\r\n") || base64Docx;

    parts = parts.concat([
      ``,
      `--${boundary}`,
      `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document; name="${docxFileName}"`,
      `Content-Disposition: attachment; filename="${docxFileName}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64Chunked,
    ]);
  }

  parts.push(`--${boundary}--`);

  return parts.join("\r\n");
}

export const createGmailDraft = async (
  result: AnalysisResult,
  lang: 'vi' | 'en',
  docxBlob?: Blob,
  docxFileName?: string
): Promise<{ id: string }> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const vi = lang === 'vi';
  const meetingTopic = result.overview.topic || (vi ? 'Chưa xác định' : 'Unrecorded');
  const subject = vi 
    ? `[Biên bản Cuộc họp] - ${meetingTopic}` 
    : `[Meeting Minutes] - ${meetingTopic}`;

  // Build beautiful HTML Body
  const htmlBody = `
<div style="font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f8fafc; padding: 24px; padding-bottom: 48px;">
  <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    
    <!-- Header banner -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 28px 32px; color: #ffffff;">
      <p style="text-transform: uppercase; font-size: 11px; letter-spacing: 0.15em; font-weight: 700; margin: 0 0 6px 0; color: #38bdf8;">
        ${vi ? 'BIÊN BẢN TÀI LIỆU HỌP PHÁT HÀNH' : 'OFFICIAL MEETING SUMMARY'}
      </p>
      <h2 style="font-size: 22px; font-weight: 800; margin: 0; line-height: 1.3; color: #ffffff; font-family: 'Segoe UI Black', Arial, sans-serif;">
        ${meetingTopic}
      </h2>
    </div>

    <!-- Main Content wrapper -->
    <div style="padding: 32px;">
      
      <!-- General Section -->
      <h3 style="font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin: 0 0 16px 0;">
        ${vi ? 'Thông tin chung' : 'Overview'}
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #64748b; width: 140px; font-weight: 600;">${vi ? 'Chủ đề' : 'Topic'}:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: bold;">${meetingTopic}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b; font-weight: 600;">${vi ? 'Thời gian' : 'Date & Time'}:</td>
          <td style="padding: 6px 0; color: #334155;">${result.overview.dateTime || '[Unrecorded]'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b; font-weight: 600;">${vi ? 'Địa điểm' : 'Location'}:</td>
          <td style="padding: 6px 0; color: #334155;">${result.overview.location || '[Unrecorded]'}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b; font-weight: 600;">${vi ? 'Thành viên tham dự' : 'Attendees'}:</td>
          <td style="padding: 6px 0; color: #334155;">${result.overview.attendees?.join(', ') || '[Unrecorded]'}</td>
        </tr>
      </table>

      <!-- Main Objectives -->
      ${result.mainObjectives?.length > 0 ? `
        <h3 style="font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin: 28px 0 12px 0;">
          ${vi ? 'Mục tiêu chính' : 'Strategic Objectives'}
        </h3>
        <ul style="margin: 0 0 24px 0; padding: 0 0 0 20px;">
          ${result.mainObjectives.map(obj => `<li style="font-size: 14px; color: #334155; margin-bottom: 6px; line-height: 1.5;">${obj}</li>`).join('')}
        </ul>
      ` : ''}

      <!-- Discussion Summary -->
      ${result.discussionSummary ? `
        <h3 style="font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin: 28px 0 12px 0;">
          ${vi ? 'Tóm tắt nội dung thảo luận' : 'Discussion Summary'}
        </h3>
        <div style="margin-bottom: 24px; color: #334155;">
          ${markdownToHtml(result.discussionSummary)}
        </div>
      ` : ''}

      <!-- Decisions -->
      ${result.decisions?.length > 0 ? `
        <h3 style="font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin: 28px 0 12px 0;">
          ${vi ? 'Quyết định chốt' : 'Key Decisions'}
        </h3>
        <ul style="margin: 0 0 24px 0; padding: 0 0 0 20px;">
          ${result.decisions.map(d => `<li style="font-size: 14px; color: #0f172a; font-weight: 600; margin-bottom: 8px; line-height: 1.5;">${d.decision}</li>`).join('')}
        </ul>
      ` : ''}

      <!-- Action Items -->
      ${result.actionItems?.length > 0 ? `
        <h3 style="font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin: 28px 0 12px 0;">
          ${vi ? 'Hành động phối hợp' : 'Action Items'}
        </h3>
        <div style="overflow-x: auto; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
            <thead>
              <tr style="background-color: #0f172a; color: #ffffff;">
                <th style="padding: 10px; font-weight: bold; border: 1px solid #334155;">${vi ? 'Công việc' : 'Task'}</th>
                <th style="padding: 10px; font-weight: bold; border: 1px solid #334155; width: 100px;">${vi ? 'Chủ trì' : 'Owner'}</th>
                <th style="padding: 10px; font-weight: bold; border: 1px solid #334155; width: 90px;">${vi ? 'Thời hạn' : 'Deadline'}</th>
              </tr>
            </thead>
            <tbody>
              ${result.actionItems.map(item => `
                <tr style="background-color: #f8fafc;">
                  <td style="padding: 10px; border: 1px solid #cbd5e1; color: #0f172a; font-weight: bold;">
                    ${item.task}
                    ${item.notes ? `<div style="font-size: 11px; color: #64748b; font-weight: normal; margin-top: 4px;">${item.notes}</div>` : ''}
                  </td>
                  <td style="padding: 10px; border: 1px solid #cbd5e1; color: #334155;">
                    ${item.owner || '-'}
                    ${item.collaborators ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">+ ${item.collaborators}</div>` : ''}
                  </td>
                  <td style="padding: 10px; border: 1px solid #cbd5e1; color: #0284c7; font-weight: 500;">${item.deadline || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Pending Issues -->
      ${result.pendingIssues?.length > 0 ? `
        <h3 style="font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin: 28px 0 12px 0;">
          ${vi ? 'Tồn đọng & Trì hoãn' : 'Pending Issues'}
        </h3>
        <ul style="margin: 0 0 24px 0; padding: 0 0 0 20px;">
          ${result.pendingIssues.map(i => `<li style="font-size: 14px; color: #475569; margin-bottom: 6px; line-height: 1.5;">${i}</li>`).join('')}
        </ul>
      ` : ''}

      <!-- Notes and References -->
      ${result.notesAndReferences?.length > 0 ? `
        <h3 style="font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; margin: 28px 0 12px 0;">
          ${vi ? 'Tài liệu tham chiếu' : 'Notes & References'}
        </h3>
        <ul style="margin: 0 0 12px 0; padding: 0 0 0 20px;">
          ${result.notesAndReferences.map(n => `<li style="font-size: 14px; color: #475569; margin-bottom: 6px; line-height: 1.5;">${n}</li>`).join('')}
        </ul>
      ` : ''}

    </div>

    <!-- Footer -->
    <div style="background-color: #f1f5f9; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b;">
      ${vi 
        ? 'Biên bản cuộc họp được tạo an toàn bởi Trợ lý Họp AI siêu thông minh. Vui lòng chỉnh sửa trước khi cấp phát chính thức.'
        : 'This memo was securely drafted by your AI Meeting Assistant. Feel free to adjust the draft before sending.'}
    </div>
  </div>
</div>
`;

  const rawMime = await buildMimeMessage(subject, htmlBody, docxBlob, docxFileName);
  const base64UrlSafeMime = btoa(unescape(encodeURIComponent(rawMime)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        raw: base64UrlSafeMime
      }
    })
  });

  if (!response.ok) {
    if (response.status === 401) {
      cachedAccessToken = null;
      localStorage.removeItem('google_access_token');
      throw new Error('TOKEN_EXPIRED');
    }
    const errorBody = await response.text();
    console.error('Failed to create Gmail draft:', errorBody);
    throw new Error(vi ? 'Không thể tạo email nháp trong Gmail của bạn. Hãy thử đăng nhập lại.' : 'Could not create Gmail draft. Please try logging in again.');
  }

  const json = await response.json();
  return { id: json.id };
};

export const uploadDocxToGoogleDrive = async (
  docxBlob: Blob,
  docxFileName: string,
  lang: 'vi' | 'en'
): Promise<{ id: string; webViewLink: string }> => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const vi = lang === 'vi';

  const clearToken = () => {
    cachedAccessToken = null;
    localStorage.removeItem('google_access_token');
  };

  // 1. Find or create folder "Trợ lý cuộc họp AI" in Google Drive root
  let folderId: string | null = null;
  try {
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("name = 'Trợ lý cuộc họp AI' and mimeType = 'application/vnd.google-apps.folder' and trashed = false")}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (searchResponse.status === 401) {
      clearToken();
      throw new Error('TOKEN_EXPIRED');
    }
    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      if (searchResult.files && searchResult.files.length > 0) {
        folderId = searchResult.files[0].id;
      }
    }
  } catch (searchErr: any) {
    if (searchErr?.message === 'TOKEN_EXPIRED') {
      throw searchErr;
    }
    console.error("Error searching for 'Trợ lý cuộc họp AI' folder:", searchErr);
  }

  if (!folderId) {
    try {
      const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Trợ lý cuộc họp AI',
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['root']
        })
      });
      if (createResponse.status === 401) {
        clearToken();
        throw new Error('TOKEN_EXPIRED');
      }
      if (createResponse.ok) {
        const createResult = await createResponse.json();
        folderId = createResult.id;
      } else {
        console.error("Failed to create 'Trợ lý cuộc họp AI' folder:", await createResponse.text());
      }
    } catch (createErr: any) {
      if (createErr?.message === 'TOKEN_EXPIRED') {
        throw createErr;
      }
      console.error("Error creating 'Trợ lý cuộc họp AI' folder:", createErr);
    }
  }

  // 2. Prepare metadata with optional parent folder ID
  const metadata: any = {
    name: docxFileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaPartHeader = `${delimiter}Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`;

  const multipartBlob = new Blob([
    metadataPart,
    mediaPartHeader,
    docxBlob,
    close_delim
  ], { type: `multipart/related; boundary=${boundary}` });

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: multipartBlob
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      throw new Error('TOKEN_EXPIRED');
    }
    const errorBody = await response.text();
    console.error('Failed to upload file to Google Drive:', errorBody);
    throw new Error(vi ? 'Không thể tải tệp lên Google Drive. Hãy thử đăng nhập lại.' : 'Could not upload file to Google Drive. Please try logging in again.');
  }

  const fileData = await response.json();
  const fileId = fileData.id;

  // Retrieve webViewLink
  const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (metadataResponse.status === 401) {
    clearToken();
    throw new Error('TOKEN_EXPIRED');
  }

  let webViewLink = `https://drive.google.com/file/d/${fileId}/view`;
  if (metadataResponse.ok) {
    const metaJson = await metadataResponse.json();
    if (metaJson.webViewLink) {
      webViewLink = metaJson.webViewLink;
    }
  }

  return { id: fileId, webViewLink };
};
