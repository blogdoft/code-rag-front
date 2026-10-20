import { metadataPatch } from './metadata-patch';

describe('metadataPatch', () => {
  it('returns null when nothing changed', () => {
    expect(metadataPatch({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } })).toBeNull();
  });

  it('nulls removed keys, since that is how the API removes metadata keys', () => {
    expect(metadataPatch({ a: 1, b: 2 }, { a: 1 })).toEqual({ b: null });
  });

  it('adds and changes keys', () => {
    expect(metadataPatch({ a: 1 }, { a: 2, b: 'x' })).toEqual({ a: 2, b: 'x' });
  });

  it('diffs nested objects recursively, because the server merges them recursively', () => {
    expect(metadataPatch({ n: { keep: 1, drop: 2 } }, { n: { keep: 1 } })).toEqual({
      n: { drop: null },
    });
  });

  it('replaces arrays whole', () => {
    expect(metadataPatch({ list: [1, 2] }, { list: [2] })).toEqual({ list: [2] });
  });
});
