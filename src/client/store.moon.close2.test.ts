import { describe, it } from 'vitest';
import { runners } from '../../test/store';

describe('the store (store.ts): pieces built once on the GPU', () => {
  it('draws runners 4 to 6 as the CPU does on the moon, close: their rigid pieces placed by the GPU', () => {
    runners('tranquility', [3], [4, 5, 6]);
  }, 120_000);
});
