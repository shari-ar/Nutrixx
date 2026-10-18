import { canonicalizeJson } from '@nutrixx/canonical-schema';

import type {
  EditableDataFileV1,
  LocalDataExportArtifactV1,
} from '@nutrixx/persistence';

export type PlainLocalFileV1 = EditableDataFileV1 | LocalDataExportArtifactV1;

export interface EncryptedLocalFileV1 {
  readonly format: 'nutrixx.local-file';
  readonly formatVersion: 1;
  readonly kind: PlainLocalFileV1['kind'];
  readonly protection: 'password-encrypted';
  readonly crypto: {
    readonly kdf: 'PBKDF2-HMAC-SHA-256';
    readonly iterations: number;
    readonly salt: string;
    readonly cipher: 'AES-256-GCM';
    readonly iv: string;
    readonly tagLength: 128;
  };
  readonly ciphertext: string;
}

export class LocalFileCryptoError extends Error {
  constructor(
    readonly code:
      | 'passphrase-required'
      | 'invalid-file'
      | 'unsupported-crypto'
      | 'decryption-failed',
    message: string,
  ) {
    super(message);
    this.name = 'LocalFileCryptoError';
  }
}

const ITERATIONS = 600_000;
const MAX_ITERATIONS = 2_000_000;
const MAX_PASSPHRASE_BYTES = 1_024;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function requireWebCrypto(): Crypto {
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.getRandomValues !== 'function' ||
    crypto.subtle === undefined
  ) {
    throw new LocalFileCryptoError(
      'unsupported-crypto',
      'This browser context does not support secure local file protection.',
    );
  }
  return crypto;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function passphraseBytes(passphrase: string): Uint8Array {
  const bytes = encoder.encode(passphrase);
  if (
    passphrase.trim().length === 0 ||
    bytes.byteLength > MAX_PASSPHRASE_BYTES
  ) {
    throw new LocalFileCryptoError(
      'passphrase-required',
      'Enter a nonempty file passphrase of at most 1,024 UTF-8 bytes.',
    );
  }
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(
      String.fromCharCode(
        ...Array.from(bytes.subarray(offset, offset + 0x8000)),
      ),
    );
  }
  return btoa(chunks.join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function decodeBase64Url(value: string): Uint8Array {
  if (!BASE64URL.test(value) || value.length % 4 === 1) {
    throw new LocalFileCryptoError(
      'invalid-file',
      'Invalid encrypted file encoding.',
    );
  }
  let binary: string;
  try {
    binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  } catch {
    throw new LocalFileCryptoError(
      'invalid-file',
      'Invalid encrypted file encoding.',
    );
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (encodeBase64Url(bytes) !== value) {
    throw new LocalFileCryptoError(
      'invalid-file',
      'Invalid encrypted file encoding.',
    );
  }
  return bytes;
}

function parseEncryptedFile(input: unknown): EncryptedLocalFileV1 {
  if (
    !record(input) ||
    !exactKeys(input, [
      'format',
      'formatVersion',
      'kind',
      'protection',
      'crypto',
      'ciphertext',
    ]) ||
    input['format'] !== 'nutrixx.local-file' ||
    input['formatVersion'] !== 1 ||
    (input['kind'] !== 'editable-data' &&
      input['kind'] !== 'complete-backup') ||
    input['protection'] !== 'password-encrypted' ||
    !record(input['crypto']) ||
    !exactKeys(input['crypto'], [
      'kdf',
      'iterations',
      'salt',
      'cipher',
      'iv',
      'tagLength',
    ]) ||
    typeof input['ciphertext'] !== 'string'
  ) {
    throw new LocalFileCryptoError(
      'invalid-file',
      'Invalid encrypted local file.',
    );
  }
  const header = input['crypto'];
  if (
    header['kdf'] !== 'PBKDF2-HMAC-SHA-256' ||
    header['cipher'] !== 'AES-256-GCM' ||
    header['tagLength'] !== 128 ||
    !Number.isSafeInteger(header['iterations']) ||
    (header['iterations'] as number) < ITERATIONS ||
    (header['iterations'] as number) > MAX_ITERATIONS
  ) {
    throw new LocalFileCryptoError(
      'unsupported-crypto',
      'Unsupported encrypted file parameters.',
    );
  }
  if (typeof header['salt'] !== 'string' || typeof header['iv'] !== 'string') {
    throw new LocalFileCryptoError(
      'invalid-file',
      'Invalid encrypted file header.',
    );
  }
  if (
    decodeBase64Url(header['salt']).length !== 16 ||
    decodeBase64Url(header['iv']).length !== 12 ||
    decodeBase64Url(input['ciphertext']).length < 16
  ) {
    throw new LocalFileCryptoError(
      'invalid-file',
      'Invalid encrypted file header.',
    );
  }
  return input as unknown as EncryptedLocalFileV1;
}

function authenticatedHeader(file: EncryptedLocalFileV1): Uint8Array {
  return encoder.encode(
    canonicalizeJson({
      format: file.format,
      formatVersion: file.formatVersion,
      kind: file.kind,
      protection: file.protection,
      crypto: file.crypto,
    }),
  );
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  usage: KeyUsage,
): Promise<CryptoKey> {
  const browserCrypto = requireWebCrypto();
  const keyMaterial = await browserCrypto.subtle.importKey(
    'raw',
    passphraseBytes(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return browserCrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export async function encryptLocalFile(
  plain: PlainLocalFileV1,
  passphrase: string,
): Promise<EncryptedLocalFileV1> {
  passphraseBytes(passphrase);
  if (
    plain.format !== 'nutrixx.local-file' ||
    plain.formatVersion !== 1 ||
    plain.protection !== 'plain' ||
    (plain.kind !== 'editable-data' && plain.kind !== 'complete-backup')
  ) {
    throw new LocalFileCryptoError('invalid-file', 'Invalid plain local file.');
  }
  const browserCrypto = requireWebCrypto();
  const salt = browserCrypto.getRandomValues(new Uint8Array(16));
  const iv = browserCrypto.getRandomValues(new Uint8Array(12));
  const header = {
    format: plain.format,
    formatVersion: plain.formatVersion,
    kind: plain.kind,
    protection: 'password-encrypted',
    crypto: {
      kdf: 'PBKDF2-HMAC-SHA-256',
      iterations: ITERATIONS,
      salt: encodeBase64Url(salt),
      cipher: 'AES-256-GCM',
      iv: encodeBase64Url(iv),
      tagLength: 128,
    },
  } as const;
  const key = await deriveKey(passphrase, salt, ITERATIONS, 'encrypt');
  const ciphertext = await browserCrypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: authenticatedHeader({ ...header, ciphertext: '' }),
      tagLength: 128,
    },
    key,
    encoder.encode(JSON.stringify(plain)),
  );
  return { ...header, ciphertext: encodeBase64Url(new Uint8Array(ciphertext)) };
}

export async function decryptLocalFile(
  input: unknown,
  passphrase: string,
): Promise<PlainLocalFileV1> {
  const file = parseEncryptedFile(input);
  passphraseBytes(passphrase);
  const browserCrypto = requireWebCrypto();
  const key = await deriveKey(
    passphrase,
    decodeBase64Url(file.crypto.salt),
    file.crypto.iterations,
    'decrypt',
  );
  let plain: unknown;
  try {
    const decrypted = await browserCrypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decodeBase64Url(file.crypto.iv),
        additionalData: authenticatedHeader(file),
        tagLength: 128,
      },
      key,
      decodeBase64Url(file.ciphertext),
    );
    plain = JSON.parse(decoder.decode(decrypted));
  } catch {
    throw new LocalFileCryptoError(
      'decryption-failed',
      'The passphrase is incorrect or the encrypted file has changed.',
    );
  }
  if (
    !record(plain) ||
    plain['format'] !== 'nutrixx.local-file' ||
    plain['formatVersion'] !== 1 ||
    plain['kind'] !== file.kind ||
    plain['protection'] !== 'plain' ||
    !record(plain['content'])
  ) {
    throw new LocalFileCryptoError(
      'invalid-file',
      'The decrypted local file does not match its envelope.',
    );
  }
  return plain as unknown as PlainLocalFileV1;
}

export async function openLocalFile(
  input: unknown,
  passphrase?: string,
): Promise<unknown> {
  if (!record(input) || input['protection'] !== 'password-encrypted')
    return input;
  if (passphrase === undefined) {
    throw new LocalFileCryptoError(
      'passphrase-required',
      'Enter the passphrase for this encrypted file.',
    );
  }
  return decryptLocalFile(input, passphrase);
}
