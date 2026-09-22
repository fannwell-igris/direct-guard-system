import jwt from "jsonwebtoken";

// Requires JWT_SECRET in .env. Fails loudly at startup rather than
// silently signing tokens with an empty/guessable secret.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set in .env — add a long random string, e.g. JWT_SECRET=<run `openssl rand -hex 32` or similar>"
  );
}

const TOKEN_EXPIRY = "24h";

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: string;
  departmentId?: string | null;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: TOKEN_EXPIRY });
}

/** Throws if the token is missing, malformed, expired, or has a bad signature. */
export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET as string) as AuthTokenPayload;
}
