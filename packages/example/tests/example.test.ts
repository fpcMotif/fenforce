import { greet } from '../index';

export const testExample = (): void => {
  const result = greet('world');
  if (result !== 'Hello, world!') {
    throw new Error(`Expected "Hello, world!", received "${result}"`);
  }
};
