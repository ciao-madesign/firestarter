import { describe, expect, it } from 'vitest';
import { parseYaml, YamlError } from '../src/docs/yaml.ts';

const OPENAPI = `openapi: 3.0.3
info:
  title: API note   # titolo
  version: "1.0"
paths:
  /api/notes:
    post:
      summary: Crea una nota
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [title]
              properties:
                title: { type: string, minLength: 3 }
      responses:
        '201':
          description: Creata
        "422":
          description: Dati non validi
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`;

describe('parser YAML minimo', () => {
  it('legge un documento OpenAPI scritto a mano', () => {
    const d = parseYaml(OPENAPI) as any;
    expect(d.openapi).toBe('3.0.3');
    expect(d.info.version).toBe('1.0');
    expect(d.info.title).toBe('API note');
    const post = d.paths['/api/notes'].post;
    expect(post.security).toEqual([{ bearerAuth: [] }]);
    expect(post.requestBody.content['application/json'].schema.required).toEqual(['title']);
    expect(post.requestBody.content['application/json'].schema.properties.title).toEqual({ type: 'string', minLength: 3 });
    expect(Object.keys(post.responses)).toEqual(['201', '422']);
    expect(d.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  it('lista di mappe e liste a livello della chiave', () => {
    const d = parseYaml('servers:\n  - url: http://a\n    description: dev\n  - url: http://b\ntags:\n- x\n- y\n') as any;
    expect(d.servers).toEqual([{ url: 'http://a', description: 'dev' }, { url: 'http://b' }]);
    expect(d.tags).toEqual(['x', 'y']);
  });

  it('errori espliciti con numero di riga', () => {
    expect(() => parseYaml('a:\n\tb: 1')).toThrow(/tabulazioni/);
    expect(() => parseYaml('a: 1\na: 2')).toThrow(/duplicata/);
    expect(() => parseYaml('a:\n  b: 1\n c: 2')).toThrow(YamlError);
    expect(() => parseYaml('a: |\n  testo')).toThrow(/multilinea/);
    expect(() => parseYaml('a: &x 1')).toThrow(/ancore/);
    expect(() => parseYaml('a: "aperta')).toThrow(/virgolette/);
    expect(() => parseYaml('solo testo senza coppia')).toThrow(/chiave: valore/);
    try {
      parseYaml('a: 1\nb: [1, 2');
    } catch (e) {
      expect((e as YamlError).line).toBe(2);
    }
  });
});
