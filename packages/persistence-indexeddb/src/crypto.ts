import type { CanonicalPayloadHasher } from '@nutrixx/persistence';

export const sha256Canonical: CanonicalPayloadHasher = async (input) => {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
};
