// OC Lock crypto primitives.
//
// All operations are constant-time at the primitive level (we rely on @noble
// libraries). We expose a narrow surface: key generation, ECDH, HKDF, AEAD.

import { gcm } from '@noble/ciphers/aes';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes } from '@noble/hashes/utils';

export type Bytes = Uint8Array;

export interface X25519KeyPair {
    secret: Bytes;
    public: Bytes;
}

export function generateX25519KeyPair(): X25519KeyPair {
    const secret = x25519.utils.randomPrivateKey();
    const pub = x25519.getPublicKey(secret);
    return { secret, public: pub };
}

export function x25519PublicFromSecret(secret: Bytes): Bytes {
    return x25519.getPublicKey(secret);
}

export function x25519Shared(secret: Bytes, peerPublic: Bytes): Bytes {
    if (secret.length !== 32) throw new Error('x25519 secret must be 32 bytes');
    if (peerPublic.length !== 32) throw new Error('x25519 public must be 32 bytes');
    return x25519.getSharedSecret(secret, peerPublic);
}

export function hkdfSha256(ikm: Bytes, salt: Bytes, info: Bytes, length = 32): Bytes {
    return hkdf(sha256, ikm, salt, info, length);
}

export function aesGcmEncrypt(
    key: Bytes,
    nonce: Bytes,
    plaintext: Bytes,
    aad?: Bytes
): Bytes {
    if (key.length !== 32) throw new Error('aes-256-gcm requires 32-byte key');
    if (nonce.length !== 12) throw new Error('aes-256-gcm requires 12-byte nonce');
    return gcm(key, nonce, aad).encrypt(plaintext);
}

export function aesGcmDecrypt(
    key: Bytes,
    nonce: Bytes,
    ciphertext: Bytes,
    aad?: Bytes
): Bytes {
    if (key.length !== 32) throw new Error('aes-256-gcm requires 32-byte key');
    if (nonce.length !== 12) throw new Error('aes-256-gcm requires 12-byte nonce');
    return gcm(key, nonce, aad).decrypt(ciphertext);
}

export function randomBytesN(n: number): Bytes {
    return randomBytes(n);
}

export function sha256Bytes(...chunks: Bytes[]): Bytes {
    if (chunks.length === 1) return sha256(chunks[0]!);
    let total = 0;
    for (const c of chunks) total += c.length;
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
    }
    return sha256(buf);
}

export function hexEncode(bytes: Bytes): string {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i]!;
        s += (b < 16 ? '0' : '') + b.toString(16);
    }
    return s;
}

export function hexDecode(hex: string): Bytes {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length % 2 !== 0) throw new Error('hex string must have even length');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(byte)) throw new Error('invalid hex');
        out[i] = byte;
    }
    return out;
}

const B64URL_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function b64urlEncode(bytes: Bytes): string {
    let s = '';
    let i = 0;
    while (i + 3 <= bytes.length) {
        const a = bytes[i]!, b = bytes[i + 1]!, c = bytes[i + 2]!;
        s += B64URL_ALPHA[a >> 2]!;
        s += B64URL_ALPHA[((a & 3) << 4) | (b >> 4)]!;
        s += B64URL_ALPHA[((b & 15) << 2) | (c >> 6)]!;
        s += B64URL_ALPHA[c & 63]!;
        i += 3;
    }
    const rem = bytes.length - i;
    if (rem === 1) {
        const a = bytes[i]!;
        s += B64URL_ALPHA[a >> 2]!;
        s += B64URL_ALPHA[(a & 3) << 4]!;
    } else if (rem === 2) {
        const a = bytes[i]!, b = bytes[i + 1]!;
        s += B64URL_ALPHA[a >> 2]!;
        s += B64URL_ALPHA[((a & 3) << 4) | (b >> 4)]!;
        s += B64URL_ALPHA[(b & 15) << 2]!;
    }
    return s;
}

export function b64urlDecode(s: string): Bytes {
    const lookup = new Int8Array(128).fill(-1);
    for (let i = 0; i < B64URL_ALPHA.length; i++) lookup[B64URL_ALPHA.charCodeAt(i)] = i;
    const len = s.length;
    const full = Math.floor(len / 4) * 4;
    const rem = len - full;
    const outLen = (full / 4) * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0);
    const out = new Uint8Array(outLen);
    let oi = 0;
    for (let i = 0; i < full; i += 4) {
        const a = lookup[s.charCodeAt(i)]!;
        const b = lookup[s.charCodeAt(i + 1)]!;
        const c = lookup[s.charCodeAt(i + 2)]!;
        const d = lookup[s.charCodeAt(i + 3)]!;
        if ((a | b | c | d) < 0) throw new Error('invalid base64url');
        out[oi++] = (a << 2) | (b >> 4);
        out[oi++] = ((b & 15) << 4) | (c >> 2);
        out[oi++] = ((c & 3) << 6) | d;
    }
    if (rem >= 2) {
        const a = lookup[s.charCodeAt(full)]!;
        const b = lookup[s.charCodeAt(full + 1)]!;
        if ((a | b) < 0) throw new Error('invalid base64url');
        out[oi++] = (a << 2) | (b >> 4);
        if (rem === 3) {
            const c = lookup[s.charCodeAt(full + 2)]!;
            if (c < 0) throw new Error('invalid base64url');
            out[oi++] = ((b & 15) << 4) | (c >> 2);
        }
    }
    return out;
}

export function utf8Encode(s: string): Bytes {
    return new TextEncoder().encode(s);
}

export function utf8Decode(b: Bytes): string {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
}

export function zeroize(b: Bytes): void {
    b.fill(0);
}
