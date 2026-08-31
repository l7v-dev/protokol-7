import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

export type PasswordPolicyResult = {
  valid: boolean;
  errors: string[];
};

export function validatePasswordStrength(password: string): PasswordPolicyResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Parola en az 8 karakter uzunluğunda olmalıdır.');
  }

  if (password.length > 128) {
    errors.push('Parola en fazla 128 karakter olabilir.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function runScrypt(
  password: string,
  salt: string,
  keylen: number,
  options: { N?: number; r?: number; p?: number; maxmem?: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN).toString('hex');
  const derivedKey = await runScrypt(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return false;
    }

    const n = Number.parseInt(parts[1] ?? '16384', 10);
    const r = Number.parseInt(parts[2] ?? '8', 10);
    const p = Number.parseInt(parts[3] ?? '1', 10);
    const salt = parts[4] ?? '';
    const hashHex = parts[5] ?? '';

    const expectedBuffer = Buffer.from(hashHex, 'hex');
    const derivedKey = await runScrypt(password, salt, expectedBuffer.length, {
      N: n,
      r,
      p
    });

    if (derivedKey.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, expectedBuffer);
  } catch {
    return false;
  }
}
