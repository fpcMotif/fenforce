import { startMockIdentityProvider } from './mockIdentityProvider';

const provider = await startMockIdentityProvider();
console.log(`Synthetic OIDC provider: ${provider.issuer}`);
