/**
 * tests/scopes.test.js
 * Scope pruning tests (FOUND-02)
 *
 * Verifies that shopify.app.profit-tracker.toml has had excess scopes removed.
 * Phase 1 requires scopes = "" (empty string — no scopes requested).
 *
 * This test WILL fail until Plan 04 sets scopes = "" in the toml file.
 */
const fs = require('fs');
const path = require('path');

const TOML_PATH = path.join('/Users/henry/code/profit-tracker', 'shopify.app.profit-tracker.toml');

describe('Shopify app scopes (FOUND-02)', () => {
  it('shopify.app.profit-tracker.toml has no excess scopes', () => {
    const content = fs.readFileSync(TOML_PATH, 'utf8');

    // Parse the scopes value from the toml file
    const match = content.match(/scopes\s*=\s*"([^"]*)"/);
    expect(match).not.toBeNull();

    const scopesValue = match[1];
    const scopeList = scopesValue
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Phase 1 requires empty scopes — all excess scopes must be removed
    expect(scopeList).toHaveLength(0);
  });
});
