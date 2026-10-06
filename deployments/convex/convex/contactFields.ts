export const CONTACT_FIELDS = {
  account: {
    id: 'contact.account',
    name: 'accountId',
    label: 'Company',
    type: 'relation',
    required: true,
    sourceField: 'AccountId',
  },
  lastName: {
    id: 'contact.lastName',
    name: 'lastName',
    label: 'Last name',
    type: 'text',
    required: true,
    sourceField: 'LastName',
    maxLength: 100,
  },
  email: {
    id: 'contact.email',
    name: 'email',
    label: 'Email',
    type: 'email',
    required: false,
    nullable: true,
    sourceField: 'Email',
    default: null,
    maxLength: 254,
  },
} as const;

export const CONTACT_SOURCE_MAPPING = {
  object: 'Contact',
  sourceId: 'Id',
  watermark: 'SystemModstamp',
  fields: {
    AccountId: CONTACT_FIELDS.account.id,
    LastName: CONTACT_FIELDS.lastName.id,
    Email: CONTACT_FIELDS.email.id,
  },
} as const;
