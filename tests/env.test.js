/**
 * tests/env.test.js
 * Environment variable validation tests (FOUND-03)
 *
 * Verifies that server.js exits non-zero with an informative error message
 * when required environment variables are missing.
 *
 * Uses spawnSync so the server process runs in isolation — no port binding,
 * no interference with the test runner process.
 *
 * IMPORTANT: We set cwd to a temp directory without a .env file, and pass
 * a fully-explicit env object. This prevents dotenv from reading the project
 * .env file and silently restoring deleted vars. All required vars must be
 * passed explicitly in BASE_ENV; the one being tested is removed per test.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const SERVER_PATH = path.join('/Users/henry/code/profit-tracker', 'server.js');

/**
 * A minimal baseline env that satisfies all requirements EXCEPT the ones
 * we want to omit. We use a non-routable DATABASE_URL so the server
 * exits at validation time rather than hanging on a DB connection.
 *
 * PORT is set to a high number to avoid EADDRINUSE in the unlikely event
 * the server makes it past env validation.
 */
const BASE_ENV = {
  // Node internals needed to run node at all
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  // Required by server.js
  SHOPIFY_API_KEY: 'test-key',
  SHOPIFY_API_SECRET: 'test-secret',
  SHOPIFY_APP_URL: 'https://example.myshopify.com',
  DATABASE_URL: 'postgresql://fake:fake@localhost:9999/fake',
  PORT: '39999',
};

/**
 * Spawn node server.js with a controlled env — all BASE_ENV vars present
 * except the specified ones to remove. Uses os.tmpdir() as cwd so dotenv
 * cannot find and load the project .env file (which would restore deleted vars).
 * @param {string[]} removeKeys - env var names to exclude
 */
function spawnServerWithout(removeKeys) {
  const env = { ...BASE_ENV };
  for (const key of removeKeys) {
    delete env[key];
  }

  return spawnSync('node', [SERVER_PATH], {
    env,
    // Use temp dir as cwd: dotenv resolves .env relative to cwd, so an
    // empty temp dir prevents the project .env from being loaded
    cwd: os.tmpdir(),
    timeout: 3000,
    encoding: 'utf8',
  });
}

describe('Env validation on startup (FOUND-03)', () => {
  it('exits non-zero and prints error when SHOPIFY_API_KEY is missing', () => {
    const result = spawnServerWithout(['SHOPIFY_API_KEY']);
    // status is null on timeout (signal kill), both null and non-zero satisfy the check
    const exited = result.status !== 0;
    expect(exited).toBe(true);
    // stderr or stdout should mention the missing var name
    const output = (result.stderr || '') + (result.stdout || '');
    expect(output).toContain('SHOPIFY_API_KEY');
  });

  it('exits non-zero and prints error when DATABASE_URL is missing', () => {
    const result = spawnServerWithout(['DATABASE_URL']);
    const exited = result.status !== 0;
    expect(exited).toBe(true);
    const output = (result.stderr || '') + (result.stdout || '');
    expect(output).toContain('DATABASE_URL');
  });

  it('exits non-zero and prints error when SHOPIFY_SCOPES is missing', () => {
    // This test will FAIL until Plan 03 adds SHOPIFY_SCOPES to REQUIRED_ENV in server.js
    const result = spawnServerWithout(['SHOPIFY_SCOPES']);
    const exited = result.status !== 0;
    expect(exited).toBe(true);
    const output = (result.stderr || '') + (result.stdout || '');
    expect(output).toContain('SHOPIFY_SCOPES');
  });
});
