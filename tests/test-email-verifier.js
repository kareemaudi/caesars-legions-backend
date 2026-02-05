/**
 * Email Verifier Tests
 * Tests all verification checks: format, MX, disposable, role-based, typo correction
 */

const { EmailVerifier, DISPOSABLE_DOMAINS, ROLE_BASED_PREFIXES } = require('../lib/email-verifier');

// ============================================================================
// TEST HARNESS
// ============================================================================
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
    failures.push(message);
  }
}

// ============================================================================
// TESTS
// ============================================================================
async function runTests() {
  console.log('\n============================================================');
  console.log('EMAIL VERIFIER TESTS');
  console.log('============================================================\n');

  // Use a verifier with MX check disabled for unit tests (no network)
  const verifier = new EmailVerifier({ checkMX: false });
  // Separate instance for MX tests (we'll mock/test with real domains)
  const mxVerifier = new EmailVerifier({ checkMX: true, dnsTimeout: 3000 });

  // ============================================================
  // Test 1: Format Validation
  // ============================================================
  console.log('--- Test 1: Format Validation ---');
  
  const validFormat = await verifier.verify('founder@startup.com');
  assert(validFormat.checks.format.valid === true, 'Valid email passes format check');

  const noAt = await verifier.verify('founderStartup.com');
  assert(noAt.checks.format.valid === false, 'Missing @ fails format check');
  assert(noAt.flags.some(f => f.type === 'INVALID_FORMAT'), 'Missing @ has INVALID_FORMAT flag');

  const emptyLocal = await verifier.verify('@startup.com');
  assert(emptyLocal.checks.format.valid === false, 'Empty local part fails format check');

  const multiAt = await verifier.verify('founder@@startup.com');
  assert(multiAt.checks.format.valid === false, 'Multiple @ fails format check');

  const noTLD = await verifier.verify('founder@startup');
  assert(noTLD.checks.format.valid === false, 'No TLD fails format check');

  const validSubdomain = await verifier.verify('alex@mail.company.co.uk');
  assert(validSubdomain.checks.format.valid === true, 'Subdomain email passes format check');

  const emptyInput = await verifier.verify('');
  assert(emptyInput.valid === false, 'Empty string returns invalid');
  assert(emptyInput.flags.some(f => f.type === 'INVALID_INPUT'), 'Empty string has INVALID_INPUT flag');

  const nullInput = await verifier.verify(null);
  assert(nullInput.valid === false, 'Null input returns invalid');

  // ============================================================
  // Test 2: Disposable Domain Detection
  // ============================================================
  console.log('\n--- Test 2: Disposable Domain Detection ---');

  const disposable = await verifier.verify('test@mailinator.com');
  assert(disposable.checks.disposable.isDisposable === true, 'mailinator.com detected as disposable');
  assert(disposable.flags.some(f => f.type === 'DISPOSABLE'), 'Disposable flag set');
  assert(disposable.confidence < 60, 'Disposable email confidence < 60 (not sendable)');

  const realDomain = await verifier.verify('founder@stripe.com');
  assert(realDomain.checks.disposable.isDisposable === false, 'stripe.com not flagged as disposable');

  const guerrilla = await verifier.verify('anon@guerrillamail.com');
  assert(guerrilla.checks.disposable.isDisposable === true, 'guerrillamail.com detected as disposable');

  // ============================================================
  // Test 3: Role-Based Address Detection
  // ============================================================
  console.log('\n--- Test 3: Role-Based Address Detection ---');

  const infoEmail = await verifier.verify('info@company.com');
  assert(infoEmail.checks.roleBased.isRoleBased === true, '"info" detected as role-based');
  assert(infoEmail.flags.some(f => f.type === 'ROLE_BASED'), 'ROLE_BASED flag set');

  const supportEmail = await verifier.verify('support@company.com');
  assert(supportEmail.checks.roleBased.isRoleBased === true, '"support" detected as role-based');

  const salesEmail = await verifier.verify('sales@company.com');
  assert(salesEmail.checks.roleBased.isRoleBased === true, '"sales" detected as role-based');

  const hrEmail = await verifier.verify('hr@company.com');
  assert(hrEmail.checks.roleBased.isRoleBased === true, '"hr" detected as role-based');

  const realPerson = await verifier.verify('james@company.com');
  assert(realPerson.checks.roleBased.isRoleBased === false, '"james" not flagged as role-based');

  const noReply = await verifier.verify('no-reply@company.com');
  assert(noReply.checks.roleBased.isRoleBased === true, '"no-reply" detected as role-based');

  // ============================================================
  // Test 4: Domain Typo Correction
  // ============================================================
  console.log('\n--- Test 4: Domain Typo Correction ---');

  const gmailTypo = await verifier.verify('user@gmail.co');
  assert(gmailTypo.corrected === true, 'gmail.co corrected to gmail.com');
  assert(gmailTypo.email === 'user@gmail.com', 'Email updated to user@gmail.com');
  assert(gmailTypo.flags.some(f => f.type === 'TYPO_CORRECTED'), 'TYPO_CORRECTED flag set');

  const gmai = await verifier.verify('user@gmai.com');
  assert(gmai.corrected === true, 'gmai.com corrected to gmail.com');

  const noTypo = await verifier.verify('user@company.com');
  assert(noTypo.corrected === false, 'No correction needed for valid domain');

  // ============================================================
  // Test 5: Confidence Scoring
  // ============================================================
  console.log('\n--- Test 5: Confidence Scoring ---');

  const perfectEmail = await verifier.verify('alex@acmecorp.com');
  assert(perfectEmail.confidence === 100, 'Clean email gets 100 confidence');
  assert(perfectEmail.valid === true, 'Clean email is valid (≥60)');

  const disposableConf = await verifier.verify('test@yopmail.com');
  assert(disposableConf.confidence === 55, 'Disposable email gets 55 confidence (100-45)');
  assert(disposableConf.valid === false, 'Disposable email not sendable (55 < 60)');

  const roleConf = await verifier.verify('info@acmecorp.com');
  assert(roleConf.confidence === 80, 'Role-based email gets 80 confidence (100-20)');
  assert(roleConf.valid === true, 'Role-based email still valid (≥60)');

  const disposableRole = await verifier.verify('info@mailinator.com');
  assert(disposableRole.confidence === 35, 'Disposable + role-based = 35 confidence (100-45-20)');
  assert(disposableRole.valid === false, 'Disposable + role-based not sendable');

  // ============================================================
  // Test 6: Batch Verification
  // ============================================================
  console.log('\n--- Test 6: Batch Verification ---');

  const prospects = [
    { name: 'Alex', email: 'alex@goodcompany.com' },
    { name: 'Bot', email: 'info@mailinator.com' },
    { name: 'Jane', email: 'jane@realstartup.com' },
    { name: 'Ghost', email: 'invalid-email' },
    { name: 'Rob', email: 'rob@gmail.co' }  // typo
  ];

  const batchResult = await verifier.verifyBatch(prospects);
  assert(batchResult.summary.total === 5, 'Batch has 5 total results');
  assert(batchResult.summary.corrected >= 1, 'At least 1 email was corrected (gmail.co)');
  assert(batchResult.summary.invalid >= 2, 'At least 2 invalid (mailinator combo + bad format)');
  assert(batchResult.results.length === 5, 'All results returned');
  assert(batchResult.invalid.length >= 2, 'Invalid list populated');

  // Filtered batch
  const filtered = await verifier.verifyBatch(prospects, { filterInvalid: true });
  assert(filtered.results.length < 5, 'Filtered results exclude invalid emails');
  assert(filtered.results.every(r => r.verification.valid), 'All filtered results are valid');

  // ============================================================
  // Test 7: Cache Behavior
  // ============================================================
  console.log('\n--- Test 7: Cache Behavior ---');

  const cacheVerifier = new EmailVerifier({ checkMX: false, cacheExpiry: 100 });
  cacheVerifier.clearCache();
  // clearCache should work without errors
  assert(true, 'clearCache() executes without error');

  // ============================================================
  // Test 8: MX Record Lookup (live DNS — best effort)
  // ============================================================
  console.log('\n--- Test 8: MX Record Lookup (live DNS) ---');

  try {
    const gmailMX = await mxVerifier.verify('test@gmail.com');
    assert(gmailMX.checks.mx.hasMX === true, 'gmail.com has MX records');
    
    const stripeMX = await mxVerifier.verify('founder@stripe.com');
    assert(stripeMX.checks.mx.hasMX === true, 'stripe.com has MX records');

    // Test with a likely non-existent domain
    const fakeMX = await mxVerifier.verify('user@zzz-nonexistent-domain-12345.com');
    assert(fakeMX.checks.mx.hasMX === false, 'Non-existent domain has no MX records');
    assert(fakeMX.valid === false, 'Non-existent domain is invalid');
  } catch (e) {
    console.log(`  ⚠️  MX tests skipped (DNS unavailable): ${e.message}`);
  }

  // ============================================================
  // Test 9: Edge Cases
  // ============================================================
  console.log('\n--- Test 9: Edge Cases ---');

  const whitespace = await verifier.verify('  alex@company.com  ');
  assert(whitespace.email === 'alex@company.com', 'Whitespace trimmed');

  const uppercase = await verifier.verify('ALEX@COMPANY.COM');
  assert(uppercase.email === 'alex@company.com', 'Email lowercased');

  const dotName = await verifier.verify('alex.smith@company.com');
  assert(dotName.checks.format.valid === true, 'Dotted name passes format');
  assert(dotName.checks.roleBased.isRoleBased === false, 'Dotted name not role-based');

  const plusTag = await verifier.verify('alex+tag@company.com');
  assert(plusTag.checks.format.valid === true, 'Plus-tagged email passes format');

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n============================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ❌ ${f}`));
  }
  console.log('============================================================\n');

  return { passed, failed };
}

// Run
runTests().then(results => {
  process.exit(results.failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
