export const ACCOUNT_FIELDS = {
  name: {
    id: 'account.name',
    name: 'name',
    label: 'Name',
    type: 'text',
    required: true,
    sourceField: 'Name',
    maxLength: 200,
  },
  owner: {
    id: 'account.owner',
    name: 'accountOwnerId',
    label: 'Owner',
    type: 'relation',
    required: true,
    sourceField: 'OwnerId',
    default: 'actor',
  },
  industry: {
    id: 'account.industry',
    name: 'industry',
    label: 'Industry',
    type: 'select',
    required: false,
    nullable: true,
    sourceField: 'Industry',
    options: ['services', 'manufacturing'],
    default: null,
  },
} as const;

export const ACCOUNT_SOURCE_MAPPING = {
  object: 'Account',
  sourceId: 'Id',
  watermark: 'SystemModstamp',
  fields: {
    Name: ACCOUNT_FIELDS.name.id,
    OwnerId: ACCOUNT_FIELDS.owner.id,
    Industry: ACCOUNT_FIELDS.industry.id,
  },
} as const;
