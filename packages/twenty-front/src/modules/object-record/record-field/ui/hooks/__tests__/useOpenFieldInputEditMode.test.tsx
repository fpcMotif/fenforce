import { vi } from 'vite-plus/test';

import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { useOpenFieldInputEditMode } from '@/object-record/record-field/ui/hooks/useOpenFieldInputEditMode';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { useOpenFieldWidgetFieldInputEditMode } from '@/page-layout/widgets/field/hooks/useOpenFieldWidgetFieldInputEditMode';
import { act, renderHook } from '@testing-library/react';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

const mockOpenJunctionRelationFieldInput = vi.fn();
const mockOpenRelationFromManyFieldInput = vi.fn();
const mockOpenRelationToOneFieldInput = vi.fn();
const mockOpenMorphRelationOneToManyFieldInput = vi.fn();
const mockOpenMorphRelationManyToOneFieldInput = vi.fn();
const mockPushFocusItemToFocusStack = vi.fn();
const mockRemoveFocusItemFromFocusStackById = vi.fn();

const mockObjectMetadataItems = getTestEnrichedObjectMetadataItemsMock();
const mockTaskMetadata = getMockObjectMetadataItemOrThrow('task');
const mockTaskTargetsField = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: mockTaskMetadata,
  fieldName: 'taskTargets',
});

if (!mockTaskTargetsField.relation) {
  throw new Error('Task targets relation not found');
}

const mockInvalidTaskTargetsField = {
  ...mockTaskTargetsField,
  settings: {
    ...mockTaskTargetsField.settings,
    junctionTargetFieldId: mockTaskTargetsField.relation.targetFieldMetadata.id,
  },
} as FieldMetadataItem;
const mockInvalidFieldDefinition = formatFieldMetadataItemAsFieldDefinition({
  field: mockInvalidTaskTargetsField,
  objectMetadataItem: mockTaskMetadata,
}) as FieldDefinition<FieldRelationMetadata>;

vi.mock('jotai', () => ({
  useStore: () => ({
    get: () => mockObjectMetadataItems,
  }),
}));

vi.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: mockObjectMetadataItems,
  }),
}));

vi.mock('@/object-metadata/states/objectMetadataItemsSelector', () => ({
  objectMetadataItemsSelector: { atom: 'object-metadata-items-atom' },
}));

vi.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: vi.fn() }),
}));

vi.mock(
  '@/object-record/record-field/ui/hooks/useOpenJunctionRelationFieldInput',
  () => ({
    useOpenJunctionRelationFieldInput: () => ({
      openJunctionRelationFieldInput: mockOpenJunctionRelationFieldInput,
    }),
  }),
);

vi.mock(
  '@/object-record/record-field/ui/meta-types/input/hooks/useOpenFilesFieldInput',
  () => ({
    useOpenFilesFieldInput: () => ({ openFilesFieldInput: vi.fn() }),
  }),
);

vi.mock(
  '@/object-record/record-field/ui/meta-types/input/hooks/useOpenRelationFromManyFieldInput',
  () => ({
    useOpenRelationFromManyFieldInput: () => ({
      openRelationFromManyFieldInput: mockOpenRelationFromManyFieldInput,
    }),
  }),
);

vi.mock(
  '@/object-record/record-field/ui/meta-types/input/hooks/useOpenRelationToOneFieldInput',
  () => ({
    useOpenRelationToOneFieldInput: () => ({
      openRelationToOneFieldInput: mockOpenRelationToOneFieldInput,
    }),
  }),
);

vi.mock(
  '@/object-record/record-field/ui/meta-types/input/hooks/useOpenMorphRelationOneToManyFieldInput',
  () => ({
    useOpenMorphRelationOneToManyFieldInput: () => ({
      openMorphRelationOneToManyFieldInput:
        mockOpenMorphRelationOneToManyFieldInput,
    }),
  }),
);

vi.mock(
  '@/object-record/record-field/ui/meta-types/input/hooks/useOpenMorphRelationManyToOneFieldInput',
  () => ({
    useOpenMorphRelationManyToOneFieldInput: () => ({
      openMorphRelationManyToOneFieldInput:
        mockOpenMorphRelationManyToOneFieldInput,
    }),
  }),
);

vi.mock('@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack', () => ({
  usePushFocusItemToFocusStack: () => ({
    pushFocusItemToFocusStack: mockPushFocusItemToFocusStack,
  }),
}));

vi.mock(
  '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById',
  () => ({
    useRemoveFocusItemFromFocusStackById: () => ({
      removeFocusItemFromFocusStackById: mockRemoveFocusItemFromFocusStackById,
    }),
  }),
);

vi.mock(
  '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow',
  () => ({
    useAvailableComponentInstanceIdOrThrow: () => 'field-widget-instance-id',
  }),
);

describe('invalid configured junction edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      name: 'table field',
      useOpenEditMode: useOpenFieldInputEditMode,
    },
    {
      name: 'field widget',
      useOpenEditMode: useOpenFieldWidgetFieldInputEditMode,
    },
  ])('does not open an editor from a $name', ({ useOpenEditMode }) => {
    const { result } = renderHook(() => useOpenEditMode());

    act(() => {
      result.current.openFieldInput({
        fieldDefinition: mockInvalidFieldDefinition,
        recordId: 'task-record-id',
      });
    });

    expect(mockOpenJunctionRelationFieldInput).not.toHaveBeenCalled();
    expect(mockOpenRelationFromManyFieldInput).not.toHaveBeenCalled();
    expect(mockPushFocusItemToFocusStack).not.toHaveBeenCalled();
  });
});
