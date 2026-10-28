// Compare editable values rather than presentation metadata. Tag and attachment
// membership has no user-defined order in the asset editor.
export function formSnapshot<T extends {
  tag_ids: readonly string[];
  attachments: readonly { id: string }[];
}>(form: T): string {
  return JSON.stringify({
    ...Object.fromEntries(Object.entries(form as Record<string, unknown>).map(([key, value]) => [key,
      ['price', 'custom_daily', 'target_daily', 'sold_price'].includes(key) &&
      typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
        ? String(Number(value)) : value,
    ])),
    tag_ids: [...form.tag_ids].sort(),
    attachments: form.attachments.map(file => file.id).sort(),
  });
}
