import { runBlueTestSuite } from './blue-test-suite';

console.log('Starting Test Suite Execution...');
const result = runBlueTestSuite();

if (result.failed > 0) {
  console.error(`\n❌ TEST SUITE FAILED with ${result.failed} errors.`);
  process.exit(1);
} else {
  console.log(`\n✅ ALL ${result.passed} TESTS PASSED SUCCESSFULLY!`);
  process.exit(0);
}
