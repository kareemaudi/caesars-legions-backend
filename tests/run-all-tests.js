#!/usr/bin/env node

/**
 * ============================================================================
 * UNIFIED TEST RUNNER - Caesar's Legions
 * ============================================================================
 * Runs all test files and provides a summary
 * 
 * Usage: node tests/run-all-tests.js
 * ============================================================================
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TESTS_DIR = __dirname;

// Test files to run (in order of priority)
const TEST_FILES = [
  'test-metrics-tracker.js',
  'test-instantly-webhooks.js',
  'test-ab-testing.js',
  'test-webhooks.js',
  // 'test-signup-flow.js',  // Requires Stripe keys
  // 'follow-ups.test.js',    // May need setup
  // 'x-lead-scraper.test.js' // Requires network
];

const results = [];

async function runTest(testFile) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const testPath = path.join(TESTS_DIR, testFile);
    
    if (!fs.existsSync(testPath)) {
      resolve({
        file: testFile,
        status: 'SKIPPED',
        reason: 'File not found',
        duration: 0
      });
      return;
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${testFile}`);
    console.log('='.repeat(60));
    
    const child = spawn('node', [testPath], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        file: testFile,
        status: code === 0 ? 'PASS' : 'FAIL',
        exitCode: code,
        duration
      });
    });
    
    child.on('error', (err) => {
      resolve({
        file: testFile,
        status: 'ERROR',
        error: err.message,
        duration: Date.now() - startTime
      });
    });
  });
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║        🏛️ CAESAR'S LEGIONS - TEST SUITE 🏛️                 ║
╠════════════════════════════════════════════════════════════╣
║  Running ${TEST_FILES.length} test files...                              ║
╚════════════════════════════════════════════════════════════╝
`);

  const startTime = Date.now();
  
  for (const testFile of TEST_FILES) {
    const result = await runTest(testFile);
    results.push(result);
  }
  
  const totalDuration = Date.now() - startTime;
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIPPED').length;
  const errored = results.filter(r => r.status === 'ERROR').length;
  
  results.forEach(r => {
    const icon = {
      'PASS': '✅',
      'FAIL': '❌',
      'SKIPPED': '⏭️',
      'ERROR': '💥'
    }[r.status];
    
    console.log(`${icon} ${r.file.padEnd(35)} ${r.status.padEnd(8)} (${r.duration}ms)`);
    if (r.reason) console.log(`   └─ ${r.reason}`);
    if (r.error) console.log(`   └─ ${r.error}`);
  });
  
  console.log('─'.repeat(60));
  console.log(`Total: ${results.length} | ✅ ${passed} passed | ❌ ${failed} failed | ⏭️ ${skipped} skipped | 💥 ${errored} errors`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('='.repeat(60));
  
  // Exit with appropriate code
  const exitCode = failed + errored > 0 ? 1 : 0;
  
  if (exitCode === 0) {
    console.log('\n🏛️ All tests passed! Ready for deployment.\n');
  } else {
    console.log('\n⚠️ Some tests failed. Review output above.\n');
  }
  
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
