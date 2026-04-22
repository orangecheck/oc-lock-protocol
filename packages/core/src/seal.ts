// Seal and unseal OC Lock envelopes. See SPEC.md §4.

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
    zeroize,
} from '@oc-lock/crypto';

import { canonicalBytes, canonicalize, type JsonValue } from './canonical.js';
import {
    ENVELOPE_VERSION,
    type EnvelopeAlg,
    type EnvelopeKind,
    type EnvelopeRecipient,
    type LockEnvelope,
    type SealInput,
    type UnsealInput,
    type UnsealResult,
} from './types.js';

const DEFAULT_ALG: EnvelopeAlg = {
    kem: 'x25519',
    aead: 'aes-256-gcm',
    kdf: 'hkdf-sha256',
};

function envelopeToJson(env: LockEnvelope): JsonValue {
    return env as unknown as JsonValue;
}

/**
 * Compute the draft envelope id used as AAD during AEAD operations. This is
 * the canonical envelope with `ciphertext`, `sig`, and each
 * `recipients[*].wrapped_key` elided per SPEC §4.2 step 3.
 */
function computeDraftId(env: LockEnvelope): Uint8Array {
    const clone: LockEnvelope = {
        ...env,
        id: '',
        ciphertext: '',
        sig: { alg: 'bip322', pubkey: env.from.address, value: '' },
        recipients: env.recipients.map((r) => ({ ...r, wrapped_key: '' })),
    };
    const bytes = canonicalBytes(envelopeToJson(clone));
    return sha256Bytes(bytes);
}

/**
 * Compute the final envelope id: SHA-256 of the canonical envelope with
 * `sig.value` stripped to empty. The `id` field itself is excluded from the
 * hash input (we set it to empty before hashing).
 */
function computeEnvelopeId(env: LockEnvelope): Uint8Array {
    const clone: LockEnvelope = {
        ...env,
        id: '',
        sig: { alg: env.sig.alg, pubkey: env.sig.pubkey, value: '' },
    };
    const bytes = canonicalBytes(envelopeToJson(clone));
    return sha256Bytes(bytes);
}

export async function seal(input: SealInput): Promise<LockEnvelope> {
    const kind: EnvelopeKind = input.kind ?? (input.payment ? 'payment' : 'identity');
    const now = new Date().toISOString();
    const nonce_ct = randomBytesN(12);

    const content_key = randomBytesN(32);

    // Build recipients with wrapped keys.
    const recipients: EnvelopeRecipient[] = [];
    for (const r of input.recipients) {
        const device_pk_bytes = hexDecode(r.device_pk);
        const ephemeral = generateX25519KeyPair();
        const shared = x25519Shared(ephemeral.secret, device_pk_bytes);
        const kek = hkdfSha256(
            shared,
            nonce_ct,
            utf8Encode('oc-lock/v2/kek:' + r.device_id),
            32
        );
        const nonce_kek = randomBytesN(12);
        const wrapped = aesGcmEncrypt(kek, nonce_kek, content_key, utf8Encode(r.device_id));
        zeroize(ephemeral.secret);
        zeroize(shared);
        zeroize(kek);
        recipients.push({
            address: r.address,
            device_id: r.device_id,
            device_pk: r.device_pk,
            eph_pk: hexEncode(ephemeral.public),
            wrapped_key: b64urlEncode(wrapped),
            nonce_kek: hexEncode(nonce_kek),
        });
    }

    // Draft envelope (id, sig, ciphertext empty) for AAD computation.
    const draftEnv: LockEnvelope = {
        v: ENVELOPE_VERSION,
        kind,
        id: '',
        alg: DEFAULT_ALG,
        from: {
            address: input.sender.address,
            ...(input.sender.attestation_id
                ? { attestation_id: input.sender.attestation_id }
                : {}),
        },
        recipients,
        ciphertext: '',
        nonce_ct: hexEncode(nonce_ct),
        ...(input.hint !== undefined ? { hint: input.hint } : {}),
        created_at: now,
        expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
        payment: input.payment ?? null,
        sig: { alg: 'bip322', pubkey: input.sender.address, value: '' },
    };

    const draftId = computeDraftId(draftEnv);
    const ciphertext = aesGcmEncrypt(content_key, nonce_ct, input.payload, draftId);
    zeroize(content_key);

    const withCt: LockEnvelope = { ...draftEnv, ciphertext: b64urlEncode(ciphertext) };
    const envelopeIdBytes = computeEnvelopeId(withCt);
    const envelopeId = hexEncode(envelopeIdBytes);

    const signatureB64 = await input.sender.signMessage(envelopeId);

    return {
        ...withCt,
        id: envelopeId,
        sig: { alg: 'bip322', pubkey: input.sender.address, value: signatureB64 },
    };
}

export async function unseal(input: UnsealInput): Promise<UnsealResult> {
    const env = input.envelope;

    // Expiry.
    if (env.expires_at) {
        const now = input.now ? input.now() : new Date();
        if (now.getTime() > new Date(env.expires_at).getTime()) {
            throw makeError('E_EXPIRED', 'envelope is expired');
        }
    }

    // Recompute envelope id.
    const idBytes = computeEnvelopeId(env);
    const idHex = hexEncode(idBytes);
    if (idHex !== env.id) {
        throw makeError('E_BAD_SIG', 'envelope id mismatch');
    }

    // Verify sender signature unless caller opts out (self-seal).
    if (!input.skipSenderVerification) {
        if (!input.verifyBip322) {
            throw makeError('E_BAD_SIG', 'no bip322 verifier supplied');
        }
        const ok = await input.verifyBip322(env.id, env.sig.value, env.sig.pubkey);
        if (!ok) throw makeError('E_BAD_SIG', 'sender signature did not verify');
    }

    // Find our recipient entry.
    const mine = env.recipients.find((r) => r.device_id === input.device.device_id);
    if (!mine) throw makeError('E_NOT_ADDRESSED', 'no matching device_id in recipients');

    // Unwrap content key.
    const draftId = computeDraftId({ ...env, id: env.id });
    const eph_pk = hexDecode(mine.eph_pk);
    const shared = x25519Shared(input.device.secretKey, eph_pk);
    const nonce_ct = hexDecode(env.nonce_ct);
    const kek = hkdfSha256(
        shared,
        nonce_ct,
        utf8Encode('oc-lock/v2/kek:' + mine.device_id),
        32
    );
    const nonce_kek = hexDecode(mine.nonce_kek);
    const wrapped = b64urlDecode(mine.wrapped_key);

    let content_key: Uint8Array;
    try {
        content_key = aesGcmDecrypt(kek, nonce_kek, wrapped, utf8Encode(mine.device_id));
    } catch (e) {
        throw makeError('E_BAD_TAG', 'wrapped key failed to decrypt');
    } finally {
        zeroize(shared);
        zeroize(kek);
    }

    // Decrypt ciphertext.
    const ciphertext = b64urlDecode(env.ciphertext);
    let payload: Uint8Array;
    try {
        payload = aesGcmDecrypt(content_key, nonce_ct, ciphertext, draftId);
    } catch (e) {
        zeroize(content_key);
        throw makeError('E_BAD_TAG', 'ciphertext failed to decrypt');
    }
    zeroize(content_key);

    return {
        payload,
        envelopeId: env.id,
        sender: env.from,
        matchedDeviceId: mine.device_id,
    };
}

export class LockError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
        this.name = 'LockError';
    }
}

function makeError(code: string, message: string): LockError {
    return new LockError(code, message);
}

export { canonicalize, canonicalBytes };
