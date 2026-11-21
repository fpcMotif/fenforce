const SCHEME_PREFIX_REGEX = /^[a-z][a-z0-9+.-]*:\/\//i;
const PATH_SEPARATOR_REGEX = /[/\\?#]/;
const USER_INFO_PREFIX_REGEX = /^.*@/;
const PORT_SUFFIX_REGEX = /:\d+$/;
const HOSTNAME_REGEX =
  /^(((?!-))(xn--|_)?[a-z0-9-]{0,61}[a-z0-9]{1,1}\.){1,10}(xn--)?([a-z0-9][a-z0-9-]{0,60}|[a-z0-9-]{1,30}\.[a-z]{2,})$/;
const IPV4_ADDRESS_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const NUMERIC_HOST_REGEX = /^\d+(?:\/[a-zA-Z]*)?$/;
const HTTP_PREFIXES = ['http://', 'https://', 'HTTP://', 'HTTPS://'];

const stripWwwPrefixesAndTrailingDots = (host: string): string => {
  const labels = host.split('.');

  while (labels.length > 0 && labels[labels.length - 1] === '') {
    labels.pop();
  }

  while (labels[0] === 'www') {
    labels.shift();
  }

  return labels.join('.');
};

const toPunycodeHost = (host: string): string => {
  try {
    return new URL(`https://${host}`).hostname;
  } catch {
    return host;
  }
};

const normalizeDomain = (value: string): string =>
  toPunycodeHost(
    stripWwwPrefixesAndTrailingDots(
      value
        .trim()
        .replace(SCHEME_PREFIX_REGEX, '')
        .split(PATH_SEPARATOR_REGEX)[0]
        .replace(USER_INFO_PREFIX_REGEX, '')
        .replace(PORT_SUFFIX_REGEX, '')
        .toLowerCase(),
    ),
  );

const isValidRawLink = (value: string): boolean => {
  const input = value.trim();
  const absoluteUrl = HTTP_PREFIXES.some((prefix) => input.startsWith(prefix))
    ? input
    : `https://${input}`;
  const valueWithoutProtocol = absoluteUrl
    .replace('https://', '')
    .replace('http://', '')
    .replace('HTTPS://', '')
    .replace('HTTP://', '');

  if (NUMERIC_HOST_REGEX.test(valueWithoutProtocol)) {
    return false;
  }

  try {
    const hostname = new URL(absoluteUrl).hostname;
    return (
      HOSTNAME_REGEX.test(hostname) ||
      IPV4_ADDRESS_REGEX.test(hostname) ||
      hostname === 'localhost'
    );
  } catch {
    return false;
  }
};

export const normalizeCompanyDomain = (value: string): string | null => {
  if (value === '') {
    return '';
  }

  const domain = normalizeDomain(value);

  if (
    !HOSTNAME_REGEX.test(domain) ||
    IPV4_ADDRESS_REGEX.test(domain) ||
    !isValidRawLink(value)
  ) {
    return null;
  }

  return domain;
};
