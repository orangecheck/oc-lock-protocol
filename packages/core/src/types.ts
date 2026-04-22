// Wire types for OC Lock v2 envelopes. See SPEC.md §4.

export const ENVELOPE_VERSION = 2 as const;

export type EnvelopeKind = 'identity' | 'payment';

export interface EnvelopeAlg {
    kem: 'x25519';
    aead: 'aes-256-gcm';
    kdf: 'hkdf-sha256';
}

export interface EnvelopeFrom {
    address: string;
    attestation_id?: string;
}

export interface EnvelopeRecipient {
    address: string;
    device_id: string;
    device_pk: string;       // 32-byte hex X25519 pubkey
    eph_pk: string;          // 32-byte hex X25519 ephemeral pubkey
    wrapped_key: string;     // base64url(aead(content_key, kek, nonce_kek))
    nonce_kek: string;       // 12-byte hex
}

export interface EnvelopePayment {
    amount_sats: number;
    address: string;
    confirmations: number;
    relay: string;
}

export interface EnvelopeSignature {
    alg: 'bip322';
    pubkey: string;   // sender btc address
    value: string;    // base64 BIP-322
}

export interface LockEnvelope {
    v: typeof ENVELOPE_VERSION;
    kind: EnvelopeKind;
    id: string;                           // 32-byte hex
    alg: EnvelopeAlg;
    from: EnvelopeFrom;
    recipients: EnvelopeRecipient[];
    ciphertext: string;                   // base64url
    nonce_ct: string;                     // 12-byte hex
    hint?: string;
    created_at: string;                   // iso8601 utc
    expires_at: string | null;
    payment: EnvelopePayment | null;
    sig: EnvelopeSignature;
}

// Inputs

export interface DeviceRecord {
    address: string;
    device_id: string;
    device_pk: string; // hex
}

export interface SealInput {
    payload: Uint8Array;
    sender: {
        address: string;
        attestation_id?: string;
        /**
         * Returns a BIP-322 base64 signature of the given message bytes as UTF-8.
         * Exactly one call per seal (over the envelope id).
         */
        signMessage: (msg: string) => Promise<string>;
    };
    recipients: DeviceRecord[];
    kind?: EnvelopeKind;
    hint?: string;
    expiresAt?: Date | null;
    payment?: EnvelopePayment | null;
}

export interface UnsealInput {
    envelope: LockEnvelope;
    device: {
        device_id: string;
        /** 32-byte X25519 private key for this device. */
        secretKey: Uint8Array;
    };
    /**
     * Called to verify the sender's BIP-322 signature. Returns true if valid.
     * The verifier is injected because verification libraries differ between
     * Node and browser contexts; consumers plug their own.
     */
    verifyBip322?: (msg: string, signatureB64: string, address: string) => Promise<boolean>;
    /** Skip sender signature verification. Default false; true only for self-seals. */
    skipSenderVerification?: boolean;
    /** Current time; defaults to Date.now(). Used for expiry enforcement. */
    now?: () => Date;
}

export interface UnsealResult {
    payload: Uint8Array;
    envelopeId: string;
    sender: EnvelopeFrom;
    matchedDeviceId: string;
}
