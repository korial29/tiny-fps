import { describe, it } from 'vitest';
import { runners } from '../../test/store';

describe('the store (store.ts): pieces built once on the GPU', () => {
  it('draws runners 1 to 3 as the CPU does on the moon, close: their rigid pieces placed by the GPU', () => {
    runners('tranquility', [3], [1, 2, 3]);
  }, 120_000);
});
