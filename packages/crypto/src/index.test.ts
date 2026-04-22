import { describe, expect, it } from 'vitest';
import {
    aesGcmDecrypt,
    aesGcmEncrypt,
    b64urlDecode,
    b64urlEncode,
    generateX25519KeyPair,
    hexDecode,
    hexEncode,
    hkdfSha256,
    randomBytesN,
    sha256Bytes,
    utf8Encode,
    x25519Shared,
} from './index.js';

describe('crypto primitives', () => {
    it('x25519 shared secrets match from both sides', () => {
        const alice = generateX25519KeyPair();
        const bob = generateX25519KeyPair();
        const s1 = x25519Shared(alice.secret, bob.public);
        const s2 = x25519Shared(bob.secret, alice.public);
        expect(hexEncode(s1)).toBe(hexEncode(s2));
        expect(s1.length).toBe(32);
    });

    it('aes-256-gcm round-trips with aad', () => {
        const key = randomBytesN(32);
        const nonce = randomBytesN(12);
        const aad = utf8Encode('header');
        const pt = utf8Encode('hello world');
        const ct = aesGcmEncrypt(key, nonce, pt, aad);
        expect(ct.length).toBe(pt.length + 16); // +tag
        const pt2 = aesGcmDecrypt(key, nonce, ct, aad);
        expect(new TextDecoder().decode(pt2)).toBe('hello world');
    });

    it('aes-256-gcm rejects tampered ciphertext', () => {
        const key = randomBytesN(32);
        const nonce = randomBytesN(12);
        const ct = aesGcmEncrypt(key, nonce, utf8Encode('abc'));
        ct[0] = ct[0]! ^ 0xff;
        expect(() => aesGcmDecrypt(key, nonce, ct)).toThrow();
    });

    it('aes-256-gcm rejects wrong aad', () => {
        const key = randomBytesN(32);
        const nonce = randomBytesN(12);
        const ct = aesGcmEncrypt(key, nonce, utf8Encode('abc'), utf8Encode('aad1'));
        expect(() => aesGcmDecrypt(key, nonce, ct, utf8Encode('aad2'))).toThrow();
    });

    it('hkdf is deterministic and produces expected length', () => {
        const out1 = hkdfSha256(utf8Encode('ikm'), utf8Encode('salt'), utf8Encode('info'), 32);
        const out2 = hkdfSha256(utf8Encode('ikm'), utf8Encode('salt'), utf8Encode('info'), 32);
        expect(hexEncode(out1)).toBe(hexEncode(out2));
        expect(out1.length).toBe(32);
        const out3 = hkdfSha256(utf8Encode('ikm'), utf8Encode('salt'), utf8Encode('info'), 64);
        expect(out3.length).toBe(64);
        expect(hexEncode(out1)).toBe(hexEncode(out3.slice(0, 32)));
    });

    it('hex encode/decode round-trips', () => {
        const b = new Uint8Array([0x00, 0xff, 0x10, 0xab]);
        expect(hexEncode(b)).toBe('00ff10ab');
        expect(hexEncode(hexDecode('00ff10ab'))).toBe('00ff10ab');
        expect(hexEncode(hexDecode('0x00FF10AB'))).toBe('00ff10ab');
    });

    it('b64url encode/decode round-trips all lengths', () => {
        for (let n = 0; n <= 32; n++) {
            const b = randomBytesN(n);
            const s = b64urlEncode(b);
            expect(s.includes('=')).toBe(false);
            expect(s.includes('+')).toBe(false);
            expect(s.includes('/')).toBe(false);
            const b2 = b64urlDecode(s);
            expect(hexEncode(b)).toBe(hexEncode(b2));
        }
    });

    it('sha256 handles concatenation', () => {
        const a = utf8Encode('hello ');
        const b = utf8Encode('world');
        const h1 = sha256Bytes(a, b);
        const h2 = sha256Bytes(utf8Encode('hello world'));
        expect(hexEncode(h1)).toBe(hexEncode(h2));
    });
});
