const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Run build tests first, then extension tests
    const sorted = tests.sort((testA, testB) => {
      if (testA.path.includes('build.test.ts')) return -1;
      if (testB.path.includes('build.test.ts')) return 1;
      return 0;
    });
    return sorted;
  }
}

module.exports = CustomSequencer;