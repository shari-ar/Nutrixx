import { webcrypto } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  decryptLocalFile,
  encryptLocalFile,
  openLocalFile,
  type PlainLocalFileV1,
} from './browser-local-file-crypto';

const editable = {
  format: 'nutrixx.local-file',
  formatVersion: 1,
  kind: 'editable-data',
  protection: 'plain',
  content: { manifest: { subjectId: 'local-subject' }, facts: [] },
} as unknown as PlainLocalFileV1;

const backup = {
  ...editable,
  kind: 'complete-backup',
  content: { manifest: { recordCount: 0 }, records: [], transactions: [] },
} as unknown as PlainLocalFileV1;

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser-local file protection', () => {
  it.each([editable, backup])(
    'encrypts and decrypts a $kind file without exposing its content',
    async (plain) => {
      const encrypted = await encryptLocalFile(
        plain,
        'a long private passphrase',
      );
      expect(encrypted).toMatchObject({
        format: plain.format,
        kind: plain.kind,
        protection: 'password-encrypted',
        crypto: {
          kdf: 'PBKDF2-HMAC-SHA-256',
          iterations: 600_000,
          cipher: 'AES-256-GCM',
          tagLength: 128,
        },
      });
      expect(JSON.stringify(encrypted)).not.toContain('local-subject');
      expect(
        await openLocalFile(encrypted, 'a long private passphrase'),
      ).toEqual(plain);
    },
  );

  it('uses a fresh salt and IV for every file', async () => {
    const first = await encryptLocalFile(editable, 'a long private passphrase');
    const second = await encryptLocalFile(
      editable,
      'a long private passphrase',
    );
    expect(first.crypto.salt).not.toBe(second.crypto.salt);
    expect(first.crypto.iv).not.toBe(second.crypto.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('requires a passphrase and gives the same error for wrong passphrase or altered ciphertext', async () => {
    const encrypted = await encryptLocalFile(editable, 'correct passphrase');
    await expect(openLocalFile(encrypted)).rejects.toMatchObject({
      code: 'passphrase-required',
    });
    await expect(
      decryptLocalFile(encrypted, 'wrong passphrase'),
    ).rejects.toMatchObject({
      code: 'decryption-failed',
    });
    const changed = {
      ...encrypted,
      ciphertext: `${encrypted.ciphertext[0] === 'A' ? 'B' : 'A'}${encrypted.ciphertext.slice(1)}`,
    };
    await expect(
      decryptLocalFile(changed, 'correct passphrase'),
    ).rejects.toMatchObject({
      code: 'decryption-failed',
    });
  });

  it('authenticates the file purpose and cryptographic header', async () => {
    const encrypted = await encryptLocalFile(editable, 'correct passphrase');
    await expect(
      decryptLocalFile(
        { ...encrypted, kind: 'complete-backup' },
        'correct passphrase',
      ),
    ).rejects.toMatchObject({ code: 'decryption-failed' });
    await expect(
      decryptLocalFile(
        { ...encrypted, crypto: { ...encrypted.crypto, iterations: 600_001 } },
        'correct passphrase',
      ),
    ).rejects.toMatchObject({ code: 'decryption-failed' });
  });

  it('rejects unsupported and malformed parameters before key derivation', async () => {
    const encrypted = await encryptLocalFile(editable, 'correct passphrase');
    await expect(
      decryptLocalFile(
        { ...encrypted, crypto: { ...encrypted.crypto, iterations: 1 } },
        'correct passphrase',
      ),
    ).rejects.toMatchObject({ code: 'unsupported-crypto' });
    await expect(
      decryptLocalFile(
        { ...encrypted, crypto: { ...encrypted.crypto, iv: 'bad' } },
        'correct passphrase',
      ),
    ).rejects.toMatchObject({ code: 'invalid-file' });
    await expect(
      decryptLocalFile(
        { ...encrypted, content: editable.content },
        'correct passphrase',
      ),
    ).rejects.toMatchObject({ code: 'invalid-file' });
  });

  it('explains when secure browser cryptography is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    await expect(
      encryptLocalFile(editable, 'correct passphrase'),
    ).rejects.toMatchObject({ code: 'unsupported-crypto' });
  });
});
