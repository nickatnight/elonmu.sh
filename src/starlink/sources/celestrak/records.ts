export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const firstUsableById = <T extends { id: number }>(
  body: unknown,
  toItem: (record: unknown) => T | null,
  names: { body: string; item: string }
): T[] => {
  if (!Array.isArray(body))
    throw new Error(`celestrak: ${names.body} body is not a list`);
  const seen = new Set<number>();
  const items: T[] = [];
  for (const record of body) {
    const item = toItem(record);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  if (items.length === 0)
    throw new Error(
      `celestrak: no usable ${names.item} in the ${names.body} body`
    );
  return items;
};
