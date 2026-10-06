import { v, type Infer } from 'convex/values';

export const membershipRoleValidator = v.union(
  v.literal('admin'),
  v.literal('member'),
  v.literal('seller'),
  v.literal('manager'),
);

export type MembershipRole = Infer<typeof membershipRoleValidator>;

export const isSalesRole = (role: MembershipRole) =>
  role === 'seller' || role === 'manager';
