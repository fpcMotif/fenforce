import { useLingui } from '@lingui/react/macro';

import {
  SalesForm,
  salesChoice,
  salesDecimal,
  salesText,
  type SalesField,
} from './SalesForm';

type NewSalesProjectValues = {
  title: string;
  materialCode: string;
  productName: string;
  specification: string;
  application: string;
  quantityMilli: number;
  unit: 'kg' | 't' | 'L' | 'piece';
  currency: 'USD' | 'CNY' | 'EUR';
  nextAction: string;
  nextActionDate: string;
};

type SalesProjectCreateProps = {
  onSave: (values: NewSalesProjectValues) => Promise<void>;
  onCancel: () => void;
};

export const SalesProjectCreate = ({
  onSave,
  onCancel,
}: SalesProjectCreateProps) => {
  const { t } = useLingui();
  const fields: SalesField[] = [
    { name: 'title', label: t`Project name` },
    { name: 'materialCode', label: t`Material code` },
    { name: 'productName', label: t`Product name` },
    { name: 'specification', label: t`Specification or grade` },
    { name: 'application', label: t`Customer application` },
    {
      name: 'quantity',
      label: t`Expected order quantity`,
      type: 'number',
      min: '0.001',
      step: '0.001',
    },
    {
      name: 'unit',
      label: t`Unit`,
      options: [
        { value: 'kg', label: t`Kilograms` },
        { value: 't', label: t`Tonnes` },
        { value: 'L', label: t`Litres` },
        { value: 'piece', label: t`Pieces` },
      ],
    },
    {
      name: 'currency',
      label: t`Currency`,
      options: ['USD', 'CNY', 'EUR'].map((value) => ({ value, label: value })),
    },
    { name: 'nextAction', label: t`Next action` },
    { name: 'nextActionDate', label: t`Follow-up date`, type: 'date' },
  ];
  const submit = async (values: FormData) => {
    let quantityMilli: number;
    try {
      quantityMilli = salesDecimal(values, 'quantity', 3);
    } catch {
      throw new Error(
        t`Enter a positive quantity with up to three decimal places.`,
      );
    }
    await onSave({
      title: salesText(values, 'title'),
      materialCode: salesText(values, 'materialCode'),
      productName: salesText(values, 'productName'),
      specification: salesText(values, 'specification'),
      application: salesText(values, 'application'),
      quantityMilli,
      unit: salesChoice(values, 'unit', ['kg', 't', 'L', 'piece']),
      currency: salesChoice(values, 'currency', ['USD', 'CNY', 'EUR']),
      nextAction: salesText(values, 'nextAction'),
      nextActionDate: salesText(values, 'nextActionDate'),
    });
  };
  return (
    <SalesForm
      fields={fields}
      submitLabel={t`Create sales project`}
      onSubmit={submit}
      onCancel={onCancel}
    />
  );
};
