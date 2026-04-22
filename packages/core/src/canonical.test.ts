import { describe, expect, it } from 'vitest';
import { canonicalBytes, canonicalize } from './canonical.js';

describe('canonicalize', () => {
    it('sorts object keys lexicographically', () => {
        expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    });

    it('omits undefined fields', () => {
        // undefined leaks in as JS, should be stripped
        const obj = { a: 1, b: undefined } as unknown as Record<string, unknown>;
        expect(canonicalize(obj as never)).toBe('{"a":1}');
    });

    it('escapes control chars and quotes', () => {
        expect(canonicalize({ s: 'a"b\\c\nd' })).toBe('{"s":"a\\"b\\\\c\\nd"}');
        expect(canonicalize({ s: '' })).toBe('{"s":"\\u0001"}');
    });

    it('emits integers without decimals', () => {
        expect(canonicalize({ n: 1000 })).toBe('{"n":1000}');
        expect(canonicalize({ n: 0 })).toBe('{"n":0}');
        expect(canonicalize({ n: -0 })).toBe('{"n":0}');
        expect(canonicalize({ n: -123 })).toBe('{"n":-123}');
    });

    it('throws on non-finite numbers', () => {
        expect(() => canonicalize({ n: NaN } as never)).toThrow();
        expect(() => canonicalize({ n: Infinity } as never)).toThrow();
    });

    it('sorts recipients[] by device_id', () => {
        const out = canonicalize({
            recipients: [
                { device_id: 'z', x: 1 },
                { device_id: 'a', x: 2 },
                { device_id: 'm', x: 3 },
            ],
        });
        expect(out).toBe('{"recipients":[{"device_id":"a","x":2},{"device_id":"m","x":3},{"device_id":"z","x":1}]}');
    });

    it('preserves order of non-recipients arrays', () => {
        expect(canonicalize({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}');
    });

    it('appends LF in canonicalBytes', () => {
        const bytes = canonicalBytes({ a: 1 });
        expect(new TextDecoder().decode(bytes)).toBe('{"a":1}\n');
    });
});
