import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type JwtPayload = {
  sub: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  iat: number;
  exp: number;
  jti?: string;
};

function base64UrlEncode(str: string | Buffer): string {
  const buf = typeof str === 'string' ? Buffer.from(str, 'utf8') : str;
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'> & { jti?: string },
  secret: string,
  expiresInSeconds: number = 86400 * 7 // Default 7 days
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
    jti: payload.jti ?? randomUUID()
  };

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', secret)
    .update(signingInput)
    .digest();

  const encodedSignature = base64UrlEncode(signature);

  return `${signingInput}.${encodedSignature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return null;
    }

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmac('sha256', secret)
      .update(signingInput)
      .digest();

    const signatureBuffer = Buffer.from(encodedSignature, 'base64url');
    if (signatureBuffer.length !== expectedSignature.length) {
      return null;
    }

    if (!timingSafeEqual(signatureBuffer, expectedSignature)) {
      return null;
    }

    const payloadJson = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadJson) as JwtPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
