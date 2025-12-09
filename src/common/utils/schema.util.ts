const SCHEMA_KEYS_TO_REMOVE = [
  '$schema',
  'additionalProperties',
  'strict',
  'default',
  'title',
  '$id',
  '$ref',
];

export function cleanSchemaForClaude(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const cleaned = { ...schema };

  for (const key of SCHEMA_KEYS_TO_REMOVE) {
    delete cleaned[key];
  }

  if (cleaned.properties && typeof cleaned.properties === 'object') {
    const props = cleaned.properties as Record<string, unknown>;
    for (const propKey of Object.keys(props)) {
      if (typeof props[propKey] === 'object') {
        props[propKey] = cleanSchemaForClaude(
          props[propKey] as Record<string, unknown>,
        );
      }
    }
  }

  return cleaned;
}
