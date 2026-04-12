/**
 * @param {string} _name
 * @param {() => void} run
 */
function test(_name, run) {
  run();
}

test('stub unit test', () => {
  const actual = true;
  const expected = true;
  if (actual !== expected) {
    throw new Error('Stub unit test failed.');
  }
});
