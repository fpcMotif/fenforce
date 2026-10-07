import { useLingui } from '@lingui/react/macro';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { MainButton } from 'twenty-ui/components';

export type SalesField = {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'textarea';
  required?: boolean;
  value?: string;
  step?: string;
  min?: string;
  maxLength?: number;
  options?: { value: string; label: string }[];
};

type SalesFormProps = {
  fields: SalesField[];
  submitLabel: string;
  onSubmit: (values: FormData) => Promise<void>;
  children?: ReactNode;
  onCancel?: () => void;
};

const SalesInput = ({ field }: { field: SalesField }) => {
  const properties = {
    name: field.name,
    required: field.required !== false,
    defaultValue: field.value,
  };
  if (field.options)
    return (
      <select {...properties}>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  if (field.type === 'textarea')
    return (
      <textarea {...properties} rows={3} maxLength={field.maxLength ?? 2000} />
    );
  return (
    <input
      {...properties}
      type={field.type ?? 'text'}
      step={field.step}
      min={field.min}
      maxLength={field.maxLength ?? 200}
    />
  );
};

export const SalesForm = ({
  fields,
  submitLabel,
  onSubmit,
  children,
  onCancel,
}: SalesFormProps) => {
  const { t } = useLingui();
  const errorId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    setSaved(false);
    try {
      await onSubmit(values);
      setSaved(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Unable to save. Please try again.`,
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      className="fenforce-form fenforce-sales-form"
      onSubmit={submit}
      aria-describedby={error ? errorId : undefined}
    >
      <fieldset disabled={pending}>
        {children}
        <div className="fenforce-sales-fields">
          {fields.map((field) => (
            <label key={field.name}>
              <span>{field.label}</span>
              <SalesInput field={field} />
            </label>
          ))}
        </div>
        {error && (
          <p id={errorId} className="fenforce-form-error" role="alert">
            {error}
          </p>
        )}
        <p role="status">
          {saved
            ? t`Saved.`
            : pending
              ? t`Saving… If the connection drops, keep this page open.`
              : ''}
        </p>
        <div className="fenforce-form-actions">
          {onCancel && (
            <button
              type="button"
              className="fenforce-secondary-button"
              onClick={onCancel}
            >{t`Cancel`}</button>
          )}
          <MainButton type="submit" loading={pending}>
            {submitLabel}
          </MainButton>
        </div>
      </fieldset>
    </form>
  );
};

export const salesText = (values: FormData, name: string) => {
  const value = values.get(name);
  return typeof value === 'string' ? value.trim() : '';
};

export const salesDecimal = (
  values: FormData,
  name: string,
  places: number,
) => {
  const text = salesText(values, name);
  const [whole, fraction = '', ...extra] = text.split('.');
  if (
    !/^\d+$/.test(whole) ||
    !/^\d*$/.test(fraction) ||
    fraction.length > places ||
    extra.length > 0
  )
    throw new Error('INVALID_DECIMAL');
  const result = Number(
    BigInt(whole) * 10n ** BigInt(places) +
      BigInt(fraction.padEnd(places, '0')),
  );
  if (!Number.isSafeInteger(result)) throw new Error('INVALID_DECIMAL');
  return result;
};

export const salesChoice = <TOption extends string>(
  values: FormData,
  name: string,
  options: readonly TOption[],
): TOption => {
  const value = salesText(values, name);
  const selected = options.find((option) => option === value);
  if (selected === undefined) throw new Error('INVALID_SELECTION');
  return selected;
};
