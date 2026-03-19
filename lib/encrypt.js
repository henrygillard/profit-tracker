// lib/encrypt.js
// AES-256-GCM token encryption/decryption utility.
// Used to encrypt ad platform OAuth tokens before storing in AdConnection.
//
// Requires ADS_ENCRYPTION_KEY env var: a base64-encoded 32-byte key.
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

'use strict';

const crypto = require('crypto');

function getKey() {
  const raw = process.env.ADS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ADS_ENCRYPTION_KEY environment variable is required');
  }
  return Buffer.from(raw, 'base64');
}

function encrypt(plaintext) {
  const KEY = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  let enc = cipher.update(plaintext, 'utf8', 'base64');
  enc += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${enc}`;
}

function decrypt(stored) {
  const KEY = getKey();
  const [ivB64, tagB64, enc] = stored.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  let dec = decipher.update(enc, 'base64', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

module.exports = { encrypt, decrypt };
