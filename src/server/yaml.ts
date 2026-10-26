/** Serializzatore YAML minimo (per l'esportazione in formati aperti). */
export function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    if (value.includes('\n')) return '|\n' + value.replace(/\n$/, '').split('\n').map((l) => pad + '  ' + l).join('\n');
    return /^[A-Za-z0-9_./ -]+$/.test(value) && !/^(true|false|null|yes|no|\d+)$/i.test(value) && value.trim() === value ? value : JSON.stringify(value);
  }
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value
      .map((v) => {
        const inner = toYaml(v, indent + 1);
        return v !== null && typeof v === 'object' ? `${pad}- ${inner.replace(/^\s+/, '')}` : `${pad}- ${inner}`;
      })
      .join('\n')
      .replace(/^/, indent ? '\n' : '');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return '{}';
  const body = entries
    .map(([k, v]) => {
      const key = /^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
      if (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length)) {
        return `${pad}${key}:${Array.isArray(v) ? '' : ''}${toYaml(v, indent + 1).startsWith('\n') ? toYaml(v, indent + 1) : '\n' + toYaml(v, indent + 1)}`;
      }
      return `${pad}${key}: ${toYaml(v, indent + 1)}`;
    })
    .join('\n');
  return body;
}
