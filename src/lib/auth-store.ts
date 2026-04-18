// In-memory challenge store for WebAuthn
// In production, this would use Redis
interface ChallengeEntry {
  challenge: string;
  email: string;
  type: 'registration' | 'authentication';
  createdAt: number;
}

const challenges = new Map<string, ChallengeEntry>();

// Clean up expired challenges every 5 minutes
const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of challenges.entries()) {
    if (now - entry.createdAt > CHALLENGE_TTL) {
      challenges.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function storeChallenge(
  challenge: string,
  email: string,
  type: 'registration' | 'authentication'
): string {
  const id = crypto.randomUUID();
  challenges.set(id, {
    challenge,
    email,
    type,
    createdAt: Date.now(),
  });
  return id;
}

export function getChallenge(
  id: string
): ChallengeEntry | undefined {
  return challenges.get(id);
}

export function deleteChallenge(id: string): boolean {
  return challenges.delete(id);
}

// In-memory session store
interface SessionEntry {
  userId: string;
  token: string;
  expiresAt: number;
  createdAt: number;
}

const sessions = new Map<string, SessionEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sessions.entries()) {
    if (now > entry.expiresAt) {
      sessions.delete(key);
    }
  }
}, 60 * 60 * 1000);

export function storeSession(
  userId: string,
  token: string,
  expiresInMs: number = 24 * 60 * 60 * 1000
): void {
  sessions.set(token, {
    userId,
    token,
    expiresAt: Date.now() + expiresInMs,
    createdAt: Date.now(),
  });
}

export function getSession(token: string): SessionEntry | undefined {
  const session = sessions.get(token);
  if (!session) return undefined;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

export function deleteSession(token: string): boolean {
  return sessions.delete(token);
}
