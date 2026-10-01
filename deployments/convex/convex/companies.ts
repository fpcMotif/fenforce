import { v } from 'convex/values';

import { internalMutation, query } from './_generated/server';
import { requireSession } from './authorization';

const DEMO_COMPANIES = [
  {
    name: 'Northstar Labs',
    domain: 'northstar.example',
    industry: 'Technology',
    location: 'Perth, Australia',
    employeeCount: 48,
  },
  {
    name: 'Harbor & Field',
    domain: 'harborfield.example',
    industry: 'Manufacturing',
    location: 'Singapore',
    employeeCount: 126,
  },
  {
    name: 'Cedarline Health',
    domain: 'cedarline.example',
    industry: 'Healthcare',
    location: 'Melbourne, Australia',
    employeeCount: 82,
  },
  {
    name: 'Morrow Supply',
    domain: 'morrow.example',
    industry: 'Wholesale',
    location: 'Auckland, New Zealand',
    employeeCount: 31,
  },
] as const;

export const listDemo = query({
  args: {},
  handler: async (context) => {
    await requireSession(context);

    return context.db
      .query('companies')
      .withIndex('by_demo_name', (index) => index.eq('demo', true))
      .take(100);
  },
});

export const seedDemo = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (context) => {
    const existing = await context.db
      .query('companies')
      .withIndex('by_demo_name', (index) => index.eq('demo', true))
      .take(1);

    if (existing.length > 0) {
      return 0;
    }

    for (const company of DEMO_COMPANIES) {
      await context.db.insert('companies', { ...company, demo: true });
    }

    return DEMO_COMPANIES.length;
  },
});
