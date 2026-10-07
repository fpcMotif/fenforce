import { describe, expect, it } from 'vitest';

import {
  normalizeContactEmail,
  normalizeContactLastName,
} from './contactContract';
import { CONTACT_FIELDS, CONTACT_SOURCE_MAPPING } from './contactFields';

describe('CONTACT_SOURCE_MAPPING', () => {
  it('maps each source field to its contact field id', () => {
    expect(
      Object.fromEntries(
        Object.values(CONTACT_FIELDS).map((field) => [
          field.sourceField,
          field.id,
        ]),
      ),
    ).toEqual(CONTACT_SOURCE_MAPPING.fields);
    expect(CONTACT_SOURCE_MAPPING.fields).toEqual({
      AccountId: 'contact.account',
      LastName: 'contact.lastName',
      Email: 'contact.email',
    });
  });
});

describe('normalizeContactLastName', () => {
  it('trims and accepts 1 to 100 characters', () => {
    expect(normalizeContactLastName('  Synthetic  ')).toBe('Synthetic');
    expect(normalizeContactLastName('x'.repeat(100))).toHaveLength(100);
  });

  it.each(['', '   ', 'x'.repeat(101)])('rejects %j', (value) => {
    expect(() => normalizeContactLastName(value)).toThrow(
      'INVALID_CONTACT_LAST_NAME',
    );
  });
});

describe('normalizeContactEmail', () => {
  it('turns blank and explicit null into null', () => {
    expect(normalizeContactEmail(null)).toBeNull();
    expect(normalizeContactEmail('')).toBeNull();
    expect(normalizeContactEmail('   ')).toBeNull();
  });

  it('trims and preserves case', () => {
    expect(normalizeContactEmail('  Ada.Lovelace@Example.TEST ')).toBe(
      'Ada.Lovelace@Example.TEST',
    );
  });

  it.each([
    'plain',
    '@example.test',
    'a@b@example.test',
    'a b@example.test',
    'a@example',
    'a@.example',
    'a@example.',
    `${'a'.repeat(250)}@b.cd`,
  ])('rejects %j', (value) => {
    expect(() => normalizeContactEmail(value)).toThrow('INVALID_CONTACT_EMAIL');
  });
});
