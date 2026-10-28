/** Pad editable money without rounding stored precision or adding grouping/symbols. */
export function amountInput(value: number | string | null | undefined): string {
  if (value == null || value === '') return '';
  const text = String(value);
  if (!Number.isFinite(Number(text))) return text;
  // Keep scientific notation intact rather than silently rounding tiny amounts to zero.
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return text;
  const [whole, fraction = ''] = text.split('.');
  return `${whole === '' ? '0' : whole === '-' ? '-0' : whole}.${fraction.padEnd(2, '0')}`;
}
