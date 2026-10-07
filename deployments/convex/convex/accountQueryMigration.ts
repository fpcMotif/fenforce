import { v } from 'convex/values';

import { internalMutation } from './_generated/server';

export const backfillNames = internalMutation({
  args: {},
  returns: v.object({ updated: v.number(), remaining: v.boolean() }),
  handler: async (context) => {
    const companies = await context.db
      .query('workspaceCompanies')
      .withIndex('by_nameSortKey', (index) =>
        index.eq('nameSortKey', undefined),
      )
      .take(100);
    for (const company of companies)
      await context.db.patch(company._id, {
        nameSortKey: company.name.toLowerCase(),
      });
    const remaining = await context.db
      .query('workspaceCompanies')
      .withIndex('by_nameSortKey', (index) =>
        index.eq('nameSortKey', undefined),
      )
      .first();
    return { updated: companies.length, remaining: remaining !== null };
  },
});
