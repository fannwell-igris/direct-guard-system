import admin from "firebase-admin";

/**
 * Firebase Cloud Messaging setup. All three env vars must be present for
 * push notifications to actually send; if any are missing, every export
 * here is a safe no-op, so local dev (and any environment where push
 * hasn't been configured yet) is completely unaffected.
 */
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Most env-var UIs (Railway included) can't store a real multi-line value
// cleanly, so the private key is stored with literal "\n" sequences and
// unescaped here back into real newlines.
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

let app: admin.app.App | null = null;

if (projectId && clientEmail && privateKey) {
  app = admin.apps.length
    ? (admin.app() as admin.app.App)
    : admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
} else {
  console.warn(
    "Push notifications disabled: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and " +
      "FIREBASE_PRIVATE_KEY (see .env.example) to enable them."
  );
}

export function isPushConfigured(): boolean {
  return app !== null;
}

export interface PushResult {
  successCount: number;
  failureCount: number;
  /** Tokens Firebase reports as no longer valid — caller should delete these. */
  invalidTokens: string[];
}

/**
 * Sends the same notification to every token given. Never throws — a
 * send failure (for one token or all of them) just comes back reflected
 * in failureCount/invalidTokens instead of rejecting.
 */
export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<PushResult> {
  if (!app || tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
    android: { priority: "high" },
  });

  const invalidTokens: string[] = [];
  response.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code;
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      ) {
        invalidTokens.push(tokens[i]);
      }
    }
  });

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
  };
}
