import { vi } from 'vite-plus/test';

import { act, renderHook } from '@testing-library/react';

import { useCreateOneObjectMetadataItem } from '@/object-metadata/hooks/useCreateOneObjectMetadataItem';

import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import {
  findManyCommandMenuItemsQuery,
  findManyNavigationMenuItemsQuery,
  findManyViewsQuery,
  query,
  responseData,
  variables,
} from '@/object-metadata/hooks/__mocks__/useCreateOneObjectMetadataItem';

import { jestExpectSuccessfulMetadataRequestResult } from '@/object-metadata/hooks/__tests__/utils/jest-expect-metadata-request-status.util';
import { GetCurrentUserDocument } from '~/generated-metadata/graphql';
import { mockedUserData } from '~/testing/mock-data/users';
import {
  query as findManyObjectMetadataItemsQuery,
  responseData as findManyObjectMetadataItemsResponseData,
} from '@/object-metadata/hooks/__mocks__/useFindManyObjectMetadataItems';

const mocks = [
  {
    request: {
      query,
      variables,
    },
    result: vi.fn(() => ({
      data: {
        createOneObject: responseData,
      },
    })),
  },
  {
    request: {
      query: GetCurrentUserDocument,
      variables: {},
    },
    result: vi.fn(() => ({
      data: {
        currentUser: mockedUserData,
      },
    })),
  },
  {
    request: {
      query: findManyObjectMetadataItemsQuery,
      variables: {},
    },
    result: vi.fn(() => ({
      data: findManyObjectMetadataItemsResponseData,
    })),
  },
  {
    request: {
      query: findManyViewsQuery,
      variables: {
        objectMetadataId: responseData.id,
      },
    },
    result: vi.fn(() => ({
      data: {
        getViews: [],
      },
    })),
  },
  {
    request: {
      query: findManyNavigationMenuItemsQuery,
      variables: {},
    },
    result: vi.fn(() => ({
      data: {
        navigationMenuItems: [],
      },
    })),
  },
  {
    request: {
      query: findManyCommandMenuItemsQuery,
      variables: {},
    },
    result: vi.fn(() => ({
      data: {
        commandMenuItems: [],
      },
    })),
  },
];

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: mocks,
});

describe('useCreateOneObjectMetadataItem', () => {
  it('should work as expected', async () => {
    const { result } = renderHook(() => useCreateOneObjectMetadataItem(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      const res = await result.current.createOneObjectMetadataItem({
        icon: 'IconPlus',
        labelPlural: 'View Filters',
        labelSingular: 'View Filter',
        namePlural: 'viewFilters',
        nameSingular: 'viewFilter',
      });
      jestExpectSuccessfulMetadataRequestResult(res);
      expect(res.response).toEqual({ data: { createOneObject: responseData } });
    });
  });
});
