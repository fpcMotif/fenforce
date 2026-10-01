import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { SettingsCard } from '@/settings/components/SettingsCard';
import { SETTINGS_FIELD_TYPE_CATEGORIES } from '@/settings/data-model/constants/SettingsFieldTypeCategories';
import { SETTINGS_FIELD_TYPE_CATEGORY_DESCRIPTIONS } from '@/settings/data-model/constants/SettingsFieldTypeCategoryDescriptions';
import { SETTINGS_FIELD_TYPE_CONFIGS } from '@/settings/data-model/constants/SettingsFieldTypeConfigs';
import { useBooleanSettingsFormInitialValues } from '@/settings/data-model/fields/forms/boolean/hooks/useBooleanSettingsFormInitialValues';
import { useCurrencySettingsFormInitialValues } from '@/settings/data-model/fields/forms/currency/hooks/useCurrencySettingsFormInitialValues';
import { useSelectSettingsFormInitialValues } from '@/settings/data-model/fields/forms/select/hooks/useSelectSettingsFormInitialValues';
import { type FieldType } from '@/settings/data-model/types/FieldType';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { UndecoratedLink } from '@/ui/navigation/link/components/UndecoratedLink/UndecoratedLink';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { Section } from 'twenty-ui/components';
import { IconSearch } from 'twenty-ui/icon';
import { useTheme, themeCssVariables } from 'twenty-ui/theme';
import { FieldMetadataType } from '~/generated-metadata/graphql';
import { type SettingsDataModelFieldTypeFormValues } from '~/pages/settings/data-model/new-field/SettingsObjectNewFieldSelect';

type SettingsObjectNewFieldSelectorProps = {
  className?: string;
  excludedFieldTypes?: FieldType[];
  fieldMetadataItem?: Pick<
    FieldMetadataItem,
    'defaultValue' | 'options' | 'type' | 'settings'
  >;

  objectNamePlural: string;
};

const StyledTypeSelectContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: inherit;
  width: 100%;
`;

const StyledContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-start;
  width: 100%;
`;

const StyledCardContainer = styled.div`
  display: flex;

  position: relative;
  width: calc(50% - ${themeCssVariables.spacing[1]});
`;

const StyledSearchInputContainer = styled.div`
  width: 100%;
`;

const StyledFieldTypeIconContainer = styled.span`
  display: flex;
  opacity: 0.64;
`;

export const SettingsObjectNewFieldSelector = ({
  excludedFieldTypes = [],
  objectNamePlural,
}: SettingsObjectNewFieldSelectorProps) => {
  const theme = useTheme();
  const { control, setValue } =
    useFormContext<SettingsDataModelFieldTypeFormValues>();
  const [searchQuery, setSearchQuery] = useState('');
  const fieldTypeConfigs = Object.entries(SETTINGS_FIELD_TYPE_CONFIGS).flatMap(
    ([key, config]) => {
      const fieldType = Object.values(FieldMetadataType).find(
        (metadataType) => metadataType === key,
      );

      if (
        !isDefined(fieldType) ||
        excludedFieldTypes.includes(fieldType) ||
        !config.label.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return [];
      }

      return [{ fieldType, config }];
    },
  );

  const { resetDefaultValueField: resetBooleanDefaultValueField } =
    useBooleanSettingsFormInitialValues({ existingFieldMetadataId: 'new' });

  const { resetDefaultValueField: resetCurrencyDefaultValueField } =
    useCurrencySettingsFormInitialValues({ existingFieldMetadataId: 'new' });

  const { resetDefaultValueField: resetSelectDefaultValueField } =
    useSelectSettingsFormInitialValues({
      fieldMetadataId: 'new',
    });

  const resetDefaultValueField = (nextValue: FieldMetadataType) => {
    switch (nextValue) {
      case FieldMetadataType.BOOLEAN:
        resetBooleanDefaultValueField();
        break;
      case FieldMetadataType.CURRENCY:
        resetCurrencyDefaultValueField();
        break;
      case FieldMetadataType.SELECT:
      case FieldMetadataType.MULTI_SELECT:
        resetSelectDefaultValueField();
        break;
      default:
        break;
    }
  };

  return (
    <>
      {' '}
      <Section.Root>
        <StyledSearchInputContainer>
          <SettingsTextInput
            instanceId="new-field-type-search"
            LeftIcon={IconSearch}
            placeholder={t`Search a type`}
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </StyledSearchInputContainer>
      </Section.Root>
      <Controller
        name="type"
        control={control}
        render={() => (
          <StyledTypeSelectContainer>
            {SETTINGS_FIELD_TYPE_CATEGORIES.map((category) => (
              <Section.Root key={category}>
                <Section.Header
                  title={category}
                  description={
                    SETTINGS_FIELD_TYPE_CATEGORY_DESCRIPTIONS[category]
                  }
                />
                <StyledContainer>
                  {fieldTypeConfigs
                    .filter(({ config }) => config.category === category)
                    .filter(
                      ({ fieldType }) =>
                        fieldType !== FieldMetadataType.RELATION,
                    )
                    .map(({ fieldType, config }) => ({
                      fieldType,
                      config:
                        fieldType === FieldMetadataType.MORPH_RELATION
                          ? { ...config, label: t`Relation` }
                          : config,
                    }))
                    .map(({ fieldType, config }) => (
                      <StyledCardContainer key={fieldType}>
                        <UndecoratedLink
                          to={getSettingsPath(
                            SettingsPath.ObjectNewFieldConfigure,
                            { objectNamePlural },
                            { fieldType },
                          )}
                          fullWidth
                          onClick={() => {
                            setValue('type', fieldType);
                            resetDefaultValueField(fieldType);
                          }}
                        >
                          <SettingsCard
                            key={fieldType}
                            Icon={
                              <StyledFieldTypeIconContainer>
                                <config.Icon
                                  size={theme.icon.size.xl}
                                  stroke={theme.icon.stroke.sm}
                                />
                              </StyledFieldTypeIconContainer>
                            }
                            title={config.label}
                          />
                        </UndecoratedLink>
                      </StyledCardContainer>
                    ))}
                </StyledContainer>
              </Section.Root>
            ))}
          </StyledTypeSelectContainer>
        )}
      />
    </>
  );
};
