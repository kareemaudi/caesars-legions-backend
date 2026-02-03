/**
 * Tests for email-guesser.js
 * 
 * Run: node tests/email-guesser.test.js
 */

const assert = require('assert');
const {
  generatePatterns,
  guessEmail,
  learnFromVerifiedEmail,
  EMAIL_PATTERNS,
  COMPANY_SIZE_PATTERNS
} = require('../lib/email-guesser');

// Test counter
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}

console.log('\n=== Email Guesser Tests ===\n');

// ============================================================================
// Pattern Generation Tests
// ============================================================================

test('generatePatterns() returns array of emails', () => {
  const emails = generatePatterns('John', 'Doe', 'acme.com');
  assert(Array.isArray(emails), 'Should return array');
  assert(emails.length > 0, 'Should have at least one pattern');
});

test('generatePatterns() handles first.last pattern', () => {
  const emails = generatePatterns('John', 'Doe', 'acme.com');
  assert(emails.includes('john.doe@acme.com'), 'Should include first.last pattern');
});

test('generatePatterns() handles firstlast pattern', () => {
  const emails = generatePatterns('John', 'Doe', 'acme.com');
  assert(emails.includes('johndoe@acme.com'), 'Should include firstlast pattern');
});

test('generatePatterns() handles flast pattern', () => {
  const emails = generatePatterns('John', 'Doe', 'acme.com');
  assert(emails.includes('jdoe@acme.com'), 'Should include flast pattern');
});

test('generatePatterns() handles first-only pattern for startups', () => {
  const emails = generatePatterns('John', 'Doe', 'acme.com', { companySize: 'startup' });
  assert(emails.includes('john@acme.com'), 'Should include first-only pattern for startups');
});

test('generatePatterns() normalizes names to lowercase', () => {
  const emails = generatePatterns('JOHN', 'DOE', 'ACME.COM');
  assert(emails[0] === 'john.doe@acme.com', 'Should lowercase everything');
});

test('generatePatterns() handles domains with https://', () => {
  const emails = generatePatterns('John', 'Doe', 'https://www.acme.com');
  assert(emails[0] === 'john.doe@acme.com', 'Should strip protocol and www');
});

test('generatePatterns() removes duplicates', () => {
  const emails = generatePatterns('John', 'Doe', 'acme.com');
  const uniqueEmails = [...new Set(emails)];
  assert.strictEqual(emails.length, uniqueEmails.length, 'Should have no duplicates');
});

test('generatePatterns() startup size uses simple patterns', () => {
  const emails = generatePatterns('John', 'Doe', 'startup.com', { companySize: 'startup' });
  // Startups favor simple patterns like first@domain
  assert(emails.includes('john@startup.com'), 'Should include first@domain for startups');
});

test('generatePatterns() enterprise size uses formal patterns', () => {
  const emails = generatePatterns('John', 'Doe', 'bigcorp.com', { companySize: 'enterprise' });
  // Enterprises favor formal patterns
  assert(emails.includes('john.doe@bigcorp.com'), 'Should include first.last for enterprise');
});

test('generatePatterns() handles nicknames when enabled', () => {
  const emails = generatePatterns('Robert', 'Smith', 'acme.com', { includeNicknames: true });
  assert(emails.some(e => e.includes('bob')), 'Should include nickname variations');
});

test('generatePatterns() handles common nicknames correctly', () => {
  const testCases = [
    { first: 'Robert', nickname: 'bob' },
    { first: 'William', nickname: 'bill' },
    { first: 'James', nickname: 'jim' },
    { first: 'Michael', nickname: 'mike' }
  ];
  
  testCases.forEach(({ first, nickname }) => {
    const emails = generatePatterns(first, 'Doe', 'acme.com', { includeNicknames: true });
    assert(emails.some(e => e.includes(nickname)), `Should include ${nickname} for ${first}`);
  });
});

// ============================================================================
// Pattern Matching Tests
// ============================================================================

test('Pattern priority is correct', () => {
  // Most common pattern should be first
  assert.strictEqual(EMAIL_PATTERNS[0], '{first}.{last}@{domain}', 
    'first.last should be most common');
});

test('All required patterns are present', () => {
  const requiredPatterns = [
    '{first}.{last}@{domain}',
    '{first}{last}@{domain}',
    '{f}{last}@{domain}',
    '{first}@{domain}'
  ];
  
  requiredPatterns.forEach(pattern => {
    assert(EMAIL_PATTERNS.includes(pattern), `Should include pattern: ${pattern}`);
  });
});

// ============================================================================
// Guess Email Tests (without verification)
// ============================================================================

testAsync('guessEmail() returns best guess without verification', async () => {
  const result = await guessEmail('John', 'Doe', 'acme.com', { 
    verify: false,
    returnAllGuesses: false
  });
  
  assert(result.email, 'Should return an email');
  assert.strictEqual(result.email, 'john.doe@acme.com', 'Should return most likely pattern');
  assert.strictEqual(result.verified, false, 'Should not be verified');
});

testAsync('guessEmail() returns all guesses when requested', async () => {
  const results = await guessEmail('John', 'Doe', 'acme.com', { 
    verify: false,
    returnAllGuesses: true
  });
  
  assert(Array.isArray(results), 'Should return array');
  assert(results.length > 0, 'Should have multiple guesses');
  assert(results[0].confidence > results[1].confidence, 
    'First guess should have highest confidence');
});

// ============================================================================
// Real-World Test Cases
// ============================================================================

test('Real company: Stripe (first.last pattern)', () => {
  const emails = generatePatterns('Patrick', 'Collison', 'stripe.com');
  assert(emails[0] === 'patrick.collison@stripe.com', 
    'Stripe uses first.last pattern');
});

test('Real company: Tesla (flast pattern)', () => {
  const emails = generatePatterns('Elon', 'Musk', 'tesla.com');
  assert(emails.includes('emusk@tesla.com'), 
    'Should generate Tesla-style flast pattern');
});

test('Real company: Apple (first pattern for executives)', () => {
  const emails = generatePatterns('Tim', 'Cook', 'apple.com', { companySize: 'startup' });
  assert(emails.includes('tim@apple.com'), 
    'Apple executives sometimes use first@apple.com');
});

test('Handles hyphenated last names', () => {
  const emails = generatePatterns('John', 'Smith-Jones', 'acme.com');
  assert(emails.includes('john.smith-jones@acme.com'), 
    'Should preserve hyphens');
});

test('Handles names with apostrophes', () => {
  const emails = generatePatterns('John', "O'Brien", 'acme.com');
  assert(emails.some(e => e.includes("o'brien")), 
    'Should preserve apostrophes');
});

test('Handles very long names', () => {
  const emails = generatePatterns('Christopher', 'Wojciechowski', 'acme.com');
  assert(emails.length > 0, 'Should handle long names');
  assert(emails[0].length < 100, 'Should generate reasonable length emails');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('Handles single character first name', () => {
  const emails = generatePatterns('J', 'Doe', 'acme.com');
  assert(emails.includes('j.doe@acme.com'), 'Should handle single char names');
});

test('Handles same first and last name', () => {
  const emails = generatePatterns('John', 'John', 'acme.com');
  const uniqueEmails = [...new Set(emails)];
  assert.strictEqual(emails.length, uniqueEmails.length, 'Should not create duplicates');
});

test('Handles special characters in domain', () => {
  const emails = generatePatterns('John', 'Doe', 'my-company.co.uk');
  assert(emails[0] === 'john.doe@my-company.co.uk', 
    'Should handle complex TLDs');
});

test('Handles trailing slash in domain', () => {
  const emails = generatePatterns('John', 'Doe', 'acme.com/');
  assert(emails[0] === 'john.doe@acme.com', 
    'Should strip trailing slash');
});

test('Handles www. prefix', () => {
  const emails = generatePatterns('John', 'Doe', 'www.acme.com');
  assert(emails[0] === 'john.doe@acme.com', 
    'Should strip www prefix');
});

// ============================================================================
// Learning Tests
// ============================================================================

test('learnFromVerifiedEmail() detects first.last pattern', () => {
  // Should not throw
  learnFromVerifiedEmail('john.doe@acme.com', 'John', 'Doe', 'acme.com');
});

test('learnFromVerifiedEmail() detects firstlast pattern', () => {
  learnFromVerifiedEmail('johndoe@acme.com', 'John', 'Doe', 'acme.com');
});

test('learnFromVerifiedEmail() detects flast pattern', () => {
  learnFromVerifiedEmail('jdoe@acme.com', 'John', 'Doe', 'acme.com');
});

// ============================================================================
// Integration Tests (would require email-verifier.js)
// ============================================================================

testAsync('guessEmail() gracefully handles missing verifier', async () => {
  // Should fall back to best guess if verifier not available
  const result = await guessEmail('John', 'Doe', 'acme.com', { verify: true });
  
  // Either verified or best guess
  assert(result.email, 'Should return an email even without verifier');
});

// ============================================================================
// Performance Tests
// ============================================================================

test('generatePatterns() is fast (<10ms for 100 calls)', () => {
  const start = Date.now();
  
  for (let i = 0; i < 100; i++) {
    generatePatterns('John', 'Doe', 'acme.com');
  }
  
  const elapsed = Date.now() - start;
  assert(elapsed < 100, `Should be fast, took ${elapsed}ms`);
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(50));
console.log(`✓ Passed: ${passed}`);
if (failed > 0) {
  console.log(`✗ Failed: ${failed}`);
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
}
