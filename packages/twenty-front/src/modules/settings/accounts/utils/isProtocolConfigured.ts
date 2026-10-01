import { type ConnectionParametersInput } from '~/generated-metadata/graphql';

export const isProtocolConfigured = (
  config: Pick<ConnectionParametersInput, 'host' | 'password'> | undefined,
): boolean => {
  return Boolean(config?.host?.trim() && config?.password?.trim());
};

export const isProtocolConfiguredForUpdate = (
  config: Pick<ConnectionParametersInput, 'host'> | undefined,
): boolean => {
  return Boolean(config?.host?.trim());
};
