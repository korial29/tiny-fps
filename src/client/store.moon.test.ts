import { describe, it } from 'vitest';
import { runners } from '../../test/store';

// The far and near levels; the close one, three quarters of the work, in store.moon.close*.test.ts.
describe('the store (store.ts): pieces built once on the GPU', () => {
  it('draws each runner as the CPU does on the moon, far and near: his rigid pieces placed by the GPU', () => {
    runners('tranquility', [0, 1]);
  }, 120_000);
});
