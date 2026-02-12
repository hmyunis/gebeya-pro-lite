import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'crypto';

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

const DEFAULT_SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
} as const;

export const DUMMY_PASSWORD_HASH = (() => {
  const salt = Buffer.alloc(16, 0);
  const key = Buffer.alloc(DEFAULT_SCRYPT_PARAMS.keylen, 0);
  return `scrypt$${DEFAULT_SCRYPT_PARAMS.N}$${DEFAULT_SCRYPT_PARAMS.r}$${DEFAULT_SCRYPT_PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
})();

export function normalizeLoginUsername(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase();
}

export function isValidLoginUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username);
}

export async function hashPassword(
  password: string,
  pepper = '',
): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(
    `${password}${pepper}`,
    salt,
    DEFAULT_SCRYPT_PARAMS.keylen,
    {
      N: DEFAULT_SCRYPT_PARAMS.N,
      r: DEFAULT_SCRYPT_PARAMS.r,
      p: DEFAULT_SCRYPT_PARAMS.p,
    },
  );

  return `scrypt$${DEFAULT_SCRYPT_PARAMS.N}$${DEFAULT_SCRYPT_PARAMS.r}$${DEFAULT_SCRYPT_PARAMS.p}$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  pepper = '',
): Promise<boolean> {
  const parsed = parseScryptHash(storedHash);
  if (!parsed) {
    await runDummyScrypt(password, pepper);
    return false;
  }

  const derivedKey = await scryptAsync(
    `${password}${pepper}`,
    parsed.salt,
    parsed.hash.length,
    { N: parsed.N, r: parsed.r, p: parsed.p },
  );

  if (derivedKey.length !== parsed.hash.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, parsed.hash);
}

async function runDummyScrypt(password: string, pepper: string): Promise<void> {
  try {
    await scryptAsync(
      `${password}${pepper}`,
      randomBytes(16),
      DEFAULT_SCRYPT_PARAMS.keylen,
      {
        N: DEFAULT_SCRYPT_PARAMS.N,
        r: DEFAULT_SCRYPT_PARAMS.r,
        p: DEFAULT_SCRYPT_PARAMS.p,
      },
    );
  } catch {
    // Ignore. The goal is to spend roughly similar CPU time.
  }
}

function parseScryptHash(hash: string): {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
} | null {
  const parts = hash.split('$');
  if (parts.length !== 6) {
    return null;
  }

  const [algo, nStr, rStr, pStr, saltB64, hashB64] = parts;
  if (algo !== 'scrypt') {
    return null;
  }

  const N = Number.parseInt(nStr, 10);
  const r = Number.parseInt(rStr, 10);
  const p = Number.parseInt(pStr, 10);
  if (![N, r, p].every((value) => Number.isSafeInteger(value))) {
    return null;
  }

  // Hard bounds to avoid DoS from untrusted/modified stored values.
  if (N < 16384 || N > 1048576) return null; // 2^14 .. 2^20
  if (r < 1 || r > 32) return null;
  if (p < 1 || p > 16) return null;

  let salt: Buffer;
  let derivedKey: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64');
    derivedKey = Buffer.from(hashB64, 'base64');
  } catch {
    return null;
  }

  if (salt.length < 8 || salt.length > 64) return null;
  if (derivedKey.length < 32 || derivedKey.length > 128) return null;

  return { N, r, p, salt, hash: derivedKey };
}
