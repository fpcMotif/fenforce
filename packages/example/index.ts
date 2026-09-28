import { getGreeting } from './lib/impl';

export const greet = (name: string): string => {
  return getGreeting(name);
};
