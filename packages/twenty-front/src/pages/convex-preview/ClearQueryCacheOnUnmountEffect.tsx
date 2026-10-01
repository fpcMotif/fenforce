import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

// Rendered only while signed in: signing out or losing the session unmounts it,
// so the next person to sign in on this tab never sees the previous user's data.
export const ClearQueryCacheOnUnmountEffect = () => {
  const queryClient = useQueryClient();

  useEffect(() => () => queryClient.clear(), [queryClient]);

  return null;
};
