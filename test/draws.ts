// The renderer's GL calls as its tests read them: a pass draws the map's runs in its view (cells.ts),
// one draw for each stretch of them. The tests check what a pass draws and in what order, not how
// the culling cuts the map, which cells.test.ts checks on the maps themselves.

type Call = unknown[];

/** The calls that stand for a whole map: a pass's run draws merged into one. */
const merged = new WeakSet<Call>();

/**
 * Records `call` into `calls`. A pass's draws of the map's runs (consecutive draws starting before
 * `floor`, the map's opaque vertices) are recorded as one draw of the whole map, [0, floor); the draw
 * right after them from `floor` on (the shadow pass's tail: what moves) extends it, as when the
 * map and its tail were one draw. A pass draws its map right after its clear: a store's piece drawn
 * from its own buffer is not the map's, and neither are the fullscreen triangles (0, 3).
 */
export const record = (calls: Call[], call: Call, floor: number) => {
  const prev = calls.at(-1);
  if (call[0] == 'drawArrays') {
    const [first, count] = [call[2] as number, call[3] as number];
    const after = prev && merged.has(prev);
    if ((after || prev?.[0] == 'clear') && first < floor && !(first == 0 && count == 3)) {
      if (!after) {
        const whole: Call = ['drawArrays', call[1], 0, floor];
        merged.add(whole);
        calls.push(whole);
      }
      return;
    }
    if (after && first == floor) {
      prev[3] = floor + count;
      merged.delete(prev);
      return;
    }
  }
  calls.push(call);
};
