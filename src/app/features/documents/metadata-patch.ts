type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The JSON Merge Patch (RFC 7396) that turns `before` into `after`: keys that disappeared become
 * `null` (the API's only way to remove a metadata key), nested objects are diffed recursively
 * because the server merges them recursively, and arrays/scalars are replaced whole. Returns null
 * when nothing changed.
 */
export function metadataPatch(before: JsonObject, after: JsonObject): JsonObject | null {
  const patch: JsonObject = {};
  for (const key of Object.keys(before)) {
    if (!(key in after)) {
      patch[key] = null;
    }
  }
  for (const [key, value] of Object.entries(after)) {
    const previous = before[key];
    if (isObject(previous) && isObject(value)) {
      const nested = metadataPatch(previous, value);
      if (nested) {
        patch[key] = nested;
      }
    } else if (JSON.stringify(previous) !== JSON.stringify(value)) {
      patch[key] = value;
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
