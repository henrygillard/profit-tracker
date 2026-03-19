// tests/encrypt.test.js
// Tests for lib/encrypt.js AES-256-GCM round-trip.
// Sets ADS_ENCRYPTION_KEY before requiring the module so the lazy getter works.

process.env.ADS_ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('base64');

const { encrypt, decrypt } = require('../lib/encrypt');

describe('lib/encrypt', () => {
  test('round-trip: decrypt(encrypt(x)) === x', () => {
    const original = 'EAABsbCS...meta-access-token-example';
    const ciphertext = encrypt(original);
    const decrypted = decrypt(ciphertext);
    expect(decrypted).toBe(original);
  });

  test('different calls produce different ciphertext (random IV)', () => {
    const token = 'same-token-value';
    const c1 = encrypt(token);
    const c2 = encrypt(token);
    // Different IVs → different ciphertext
    expect(c1).not.toBe(c2);
    // Both must decrypt correctly
    expect(decrypt(c1)).toBe(token);
    expect(decrypt(c2)).toBe(token);
  });

  test('round-trip works for arbitrary unicode plaintext', () => {
    const values = ['short', 'a', 'x'.repeat(500), 'unicode: \u2603\u00e9\u4e2d\u6587'];
    for (const v of values) {
      expect(decrypt(encrypt(v))).toBe(v);
    }
  });

  test('throws when ADS_ENCRYPTION_KEY is missing', () => {
    const saved = process.env.ADS_ENCRYPTION_KEY;
    delete process.env.ADS_ENCRYPTION_KEY;
    expect(() => encrypt('anything')).toThrow('ADS_ENCRYPTION_KEY');
    process.env.ADS_ENCRYPTION_KEY = saved;
  });
});
