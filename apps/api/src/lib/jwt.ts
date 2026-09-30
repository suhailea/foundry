import { SignJWT, jwtVerify } from 'jose';

const SESSION_TTL = '1h';

function getSecret(): Uint8Array {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET is required');
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  tenantId: string;
  email: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return {
    userId: payload['userId'] as string,
    tenantId: payload['tenantId'] as string,
    email: payload['email'] as string,
  };
}
