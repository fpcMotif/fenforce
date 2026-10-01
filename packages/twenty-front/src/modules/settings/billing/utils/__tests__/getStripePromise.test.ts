import { vi } from 'vite-plus/test';

import { loadStripe } from '@stripe/stripe-js/pure';

import { getStripePromise } from '@/settings/billing/utils/getStripePromise';

vi.mock('@stripe/stripe-js/pure', () => ({
  loadStripe: vi.fn(),
}));

const loadStripeMock = vi.mocked(loadStripe);

describe('getStripePromise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load Stripe once per publishable key', async () => {
    loadStripeMock.mockResolvedValue(null);

    const firstPromise = getStripePromise('pk_test_dedup');
    const secondPromise = getStripePromise('pk_test_dedup');

    expect(secondPromise).toBe(firstPromise);
    expect(loadStripeMock).toHaveBeenCalledTimes(1);

    await expect(firstPromise).resolves.toBeNull();
  });

  it('should retry loading Stripe after a failed load', async () => {
    loadStripeMock
      .mockRejectedValueOnce(new Error('Failed to load Stripe.js'))
      .mockResolvedValueOnce(null);

    await expect(getStripePromise('pk_test_retry')).rejects.toThrow(
      'Failed to load Stripe.js',
    );

    const retriedPromise = getStripePromise('pk_test_retry');

    expect(loadStripeMock).toHaveBeenCalledTimes(2);
    await expect(retriedPromise).resolves.toBeNull();
  });
});
