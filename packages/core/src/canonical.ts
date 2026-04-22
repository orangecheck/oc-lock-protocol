// RFC 8785 JSON Canonicalization Scheme with one addition: within the
// envelope, `recipients` entries are sorted by `device_id` ascending before
// canonicalization. See SPEC.md §5.
//
// We implement a small, self-contained canonicalizer. Inputs are plain JSON
// values (objects, arrays, strings, numbers, booleans, null). Undefined and
// functions are rejected.

import { utf8Encode } from '@oc-lock/crypto';

export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

const JSON_RECIPIENTS_SORT_PATH = ['recipients'] as const;

export function canonicalize(value: JsonValue): string {
    return encode(value, []);
}

export function canonicalBytes(value: JsonValue): Uint8Array {
    return utf8Encode(canonicalize(value) + '\n');
}

function encode(v: JsonValue, path: string[]): string {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return encodeNumber(v);
    if (typeof v === 'string') return encodeString(v);
    if (Array.isArray(v)) {
        const parts: string[] = [];
        let items = v;
        // Sort recipients by device_id when we're at path ['recipients'].
        if (
            path.length === JSON_RECIPIENTS_SORT_PATH.length &&
            path.every((p, i) => p === JSON_RECIPIENTS_SORT_PATH[i]) &&
            items.every(
                (it) =>
                    it &&
                    typeof it === 'object' &&
                    !Array.isArray(it) &&
                    typeof (it as Record<string, JsonValue>).device_id === 'string'
            )
        ) {
            items = [...items].sort((a, b) => {
                const aid = (a as Record<string, JsonValue>).device_id as string;
                const bid = (b as Record<string, JsonValue>).device_id as string;
                return aid < bid ? -1 : aid > bid ? 1 : 0;
            });
        }
        for (let i = 0; i < items.length; i++) {
            parts.push(encode(items[i]!, path.concat(String(i))));
        }
        return '[' + parts.join(',') + ']';
    }
    if (typeof v === 'object') {
        const keys = Object.keys(v).sort();
        const parts: string[] = [];
        for (const k of keys) {
            const inner = v[k];
            if (inner === undefined) continue;
            parts.push(encodeString(k) + ':' + encode(inner as JsonValue, path.concat(k)));
        }
        return '{' + parts.join(',') + '}';
    }
    throw new Error('cannot canonicalize value of type ' + typeof v);
}

function encodeNumber(n: number): string {
    if (!Number.isFinite(n)) throw new Error('non-finite number not JSON-canonicalizable');
    if (Object.is(n, -0)) return '0';
    if (Number.isInteger(n) && Math.abs(n) < 1e21) {
        return String(n);
    }
    // Follow JSON.stringify for non-integers; it produces canonical-ish output
    // that matches IEEE 754 round-tripping for our use case (we never emit
    // floats ourselves).
    return JSON.stringify(n);
}

const ESCAPE_TABLE: Record<string, string> = {
    '\\': '\\\\',
    '"': '\\"',
    '\b': '\\b',
    '\f': '\\f',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
};

function encodeString(s: string): string {
    let out = '"';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i]!;
        const code = ch.charCodeAt(0);
        if (ESCAPE_TABLE[ch]) {
            out += ESCAPE_TABLE[ch];
        } else if (code < 0x20) {
            out += '\\u' + code.toString(16).padStart(4, '0');
        } else {
            out += ch;
        }
    }
    out += '"';
    return out;
}
