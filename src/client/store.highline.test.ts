import { describe, it } from 'vitest';
import { runners } from '../../test/store';

// The far and near levels; the close one, three quarters of the work, in store.highline.close*.test.ts.
describe('the store (store.ts): pieces built once on the GPU', () => {
  it('draws each runner as the CPU does on Highline, far and near: his rigid pieces placed by the GPU', () => {
    runners('highline', [0, 1]);
  }, 120_000);
});
