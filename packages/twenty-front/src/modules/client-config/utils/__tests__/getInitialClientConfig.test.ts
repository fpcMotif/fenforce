import { vi } from 'vite-plus/test';

import { getInitialClientConfig } from '@/client-config/utils/getInitialClientConfig';
import { getClientConfig } from '@/client-config/utils/getClientConfig';

vi.mock('@/client-config/utils/getClientConfig', () => ({
  getClientConfig: vi.fn(),
}));

const config = {
  isMultiWorkspaceEnabled: true,
  authProviders: { password: true },
};

describe('getInitialClientConfig', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    vi.clearAllMocks();
  });

  const addBootstrap = (content: string) => {
    const element = document.createElement('script');
    element.id = 'twenty-client-config';
    element.type = 'application/json';
    element.textContent = content;
    document.head.appendChild(element);
  };

  it('starts from the HTML configuration without an API request', async () => {
    addBootstrap(JSON.stringify(config));

    expect(await getInitialClientConfig()).toEqual(config);
    expect(getClientConfig).not.toHaveBeenCalled();
    expect(document.getElementById('twenty-client-config')).toBeNull();
  });

  it('uses the compatibility endpoint for static HTML and Vite', async () => {
    vi.mocked(getClientConfig).mockResolvedValueOnce(
      config as Awaited<ReturnType<typeof getClientConfig>>,
    );

    expect(await getInitialClientConfig()).toEqual(config);
    expect(getClientConfig).toHaveBeenCalledTimes(1);
  });

  it.each(['not JSON', 'null', '{}', '[]'])(
    'falls back for malformed bootstrap %s',
    async (content) => {
      addBootstrap(content);
      await getInitialClientConfig();
      expect(getClientConfig).toHaveBeenCalledTimes(1);
    },
  );

  it('does not reuse bootstrap configuration on a later initialization', async () => {
    addBootstrap(JSON.stringify(config));
    await getInitialClientConfig();
    await getInitialClientConfig();
    expect(getClientConfig).toHaveBeenCalledTimes(1);
  });
});
