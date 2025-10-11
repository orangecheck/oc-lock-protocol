---
title: LOCK Protocol — Specification
status: Draft (Normative)
version: 1.0
license: CC-BY-4.0
audience: engineers implementing LOCK clients, wallets, and verifiers
conformance: REQUIRED sections are marked **(normative)**
---

# LOCK Protocol — Specification

This document defines the **normative** requirements for implementing the LOCK (Ledger-Originated Cryptographic Key) protocol. Normative keywords **MUST / SHOULD / MAY** follow RFC‑2119.

> **Scope.** LOCK is a Bitcoin-native encryption protocol that combines encrypted payloads (SEALs) with on-chain access control (Proof-of-Access). It enables non-custodial, rebindable, auditable encryption with Bitcoin-enforced policies.

---

## 1) Terminology **(normative)**

- **SEAL** — Encrypted payload container with ciphertext, nonce, and authentication tag
- **SEAL File** — Binary serialization of a SEAL per §4
- **Rules (Metadata)** — Encrypted policy defining access conditions (authorized wallet, amount, recipient, timelock, unlock limit)
- **Bind** — On-chain Bitcoin transaction anchoring a Vault
- **Vault** — Complete structure: `{ SEAL, encrypted Rules, binding TXID }` with canonical Vault ID
- **Vault ID** — Deterministic identifier: `SHA-256(SEAL_bytes || metadata_bytes || txid_bytes)` (§5.3)
- **Proof-of-Access (PoA)** — Confirmed, non-RBF Bitcoin transaction satisfying all Rules
- **Authorized Wallet** — Bitcoin address(es) permitted to unseal
- **Recipient Wallet** — Bitcoin address where PoA funds must be sent
- **Amount Condition** — Required amount for PoA transaction (fixed or range)
- **Time Lock** — Block height before which unsealing is prohibited
- **Unlock Limit** — Maximum number of successful unseals permitted
- **Rebind** — Transfer vault access to new wallet without re-encrypting SEAL

---

## 2) SEAL File Format **(normative)**

### 2.1 Binary Structure

A SEAL file is a binary blob with the following structure:

```
[MAGIC(4)] [VERSION(1)] [ALGORITHM(1)] [NONCE_LEN(1)] [NONCE(N)] 
[TAG(16)] [CIPHERTEXT_LEN(4)] [CIPHERTEXT(M)] [HINT_LEN(2)] [HINT(H)]
```

**Field Definitions:**

| Field | Size | Type | Description |
|-------|------|------|-------------|
| `MAGIC` | 4 bytes | ASCII | Magic bytes: `SEAL` (0x5345414C) |
| `VERSION` | 1 byte | uint8 | Format version (currently `1`) |
| `ALGORITHM` | 1 byte | uint8 | Encryption algorithm ID (§2.2) |
| `NONCE_LEN` | 1 byte | uint8 | Nonce length in bytes |
| `NONCE` | N bytes | bytes | Unique nonce/IV for encryption |
| `TAG` | 16 bytes | bytes | Authentication tag (GCM/Poly1305) |
| `CIPHERTEXT_LEN` | 4 bytes | uint32 LE | Ciphertext length in bytes |
| `CIPHERTEXT` | M bytes | bytes | Encrypted payload |
| `HINT_LEN` | 2 bytes | uint16 LE | Metadata hint length (0-256) |
| `HINT` | H bytes | UTF-8 | Optional MIME type or client hint |

**Constraints:**
- Total file size MUST NOT exceed 100 MB
- `NONCE_LEN` MUST be 12 (AES-GCM) or 24 (ChaCha20-Poly1305)
- `TAG` MUST be exactly 16 bytes
- `CIPHERTEXT_LEN` MUST be > 0
- `HINT_LEN` MUST be ≤ 256
- All multi-byte integers use **little-endian** byte order

### 2.2 Encryption Algorithms **(normative)**

| ID | Algorithm | Nonce | Tag | Status |
|----|-----------|-------|-----|--------|
| `0x01` | AES-256-GCM | 12 bytes | 16 bytes | **REQUIRED** |
| `0x02` | ChaCha20-Poly1305 | 24 bytes | 16 bytes | OPTIONAL |

**Requirements:**
- All implementations MUST support AES-256-GCM (ID `0x01`)
- Implementations MAY support ChaCha20-Poly1305 (ID `0x02`)
- Unknown algorithm IDs MUST be rejected with error

### 2.3 Metadata Hint **(normative)**

The optional `HINT` field provides plaintext metadata about the encrypted payload:

**Format:** UTF-8 string, 0-256 bytes

**Common Values:**
- MIME types: `text/plain`, `application/json`, `image/png`
- Application hints: `sealchat-message`, `file-archive`
- Empty string (no hint)

**Security:** Hints are **plaintext** and MUST NOT contain sensitive information.

---

## 3) Vault Metadata (Rules) **(normative)**

### 3.1 Metadata Structure

Vault metadata is a JSON object defining access conditions:

```json
{
  "version": 1,
  "authorizedWallet": "bc1q..." | ["bc1q...", "bc1p..."] | "ANY",
  "recipientWallet": "self" | "bc1q...",
  "amountCondition": {
    "type": "fixed",
    "amount": 10000
  } | {
    "type": "range",
    "min": 1000,
    "max": 100000
  },
  "timeLock": 850000,
  "unlockLimit": 5,
  "visibility": "encrypted",
  "txid": "abc123..."
}
```

**Field Definitions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | YES | Metadata schema version (currently `1`) |
| `authorizedWallet` | string \| array \| "ANY" | YES | Wallet(s) authorized to unseal |
| `recipientWallet` | string | NO | Where PoA funds must be sent (`"self"` or address) |
| `amountCondition` | object | YES | Amount requirement for PoA (§3.2) |
| `timeLock` | integer | NO | Block height before which unsealing is prohibited |
| `unlockLimit` | integer | NO | Maximum unseals allowed (undefined = unlimited) |
| `visibility` | string | YES | Always `"encrypted"` (reserved for future use) |
| `txid` | string | NO | Binding transaction ID (added after bind) |

### 3.2 Amount Conditions **(normative)**

**Fixed Amount:**
```json
{
  "type": "fixed",
  "amount": 10000
}
```
- PoA transaction MUST send exactly `amount` satoshis
- `amount` MUST be ≥ 546 (dust limit)

**Range Amount:**
```json
{
  "type": "range",
  "min": 1000,
  "max": 100000
}
```
- PoA transaction MUST send between `min` and `max` satoshis (inclusive)
- `min` MUST be ≥ 546
- `max` MUST be > `min`
- `max` MUST be ≤ 2,100,000,000,000,000 (21M BTC)

### 3.3 Metadata Encryption **(normative)**

Metadata MUST be encrypted before storage/transmission:

**Algorithm:** AES-256-GCM

**Format:**
```
[NONCE(12)] [TAG(16)] [CIPHERTEXT(N)]
```

**Process:**
1. Serialize metadata to JSON (UTF-8, no whitespace)
2. Encrypt with AES-256-GCM using metadata key
3. Prepend nonce (12 bytes) and tag (16 bytes)
4. Result is encrypted metadata bytes

**Constraints:**
- Encrypted metadata MUST be > 0 bytes
- Encrypted metadata MUST be ≤ 10 KB

---

## 4) Vault Structure **(normative)**

### 4.1 Complete Vault

A Vault is the composite structure:

```typescript
{
  id: string,              // Vault ID (64 hex chars)
  seal: SealFile,          // SEAL file object
  metadata: VaultMetadata, // Decrypted rules
  encryptedMetadata: Uint8Array, // Encrypted rules bytes
  createdAt: number,       // Unix timestamp (ms)
  bindingTxid?: string     // Binding TX ID (64 hex chars)
}
```

### 4.2 Vault ID Generation **(normative)**

Vault ID is computed as:

```
vault_id = SHA-256(seal_bytes || metadata_bytes || txid_bytes)
```

**Where:**
- `seal_bytes` = Complete SEAL file binary (§2.1)
- `metadata_bytes` = Encrypted metadata bytes (§3.3)
- `txid_bytes` = Binding transaction ID as 32 bytes (little-endian, reversed from hex)

**Process:**
1. Serialize SEAL to binary per §2.1
2. Get encrypted metadata bytes per §3.3
3. Convert txid from hex to 32 bytes (LE, reversed)
4. Concatenate: `seal_bytes || metadata_bytes || txid_bytes`
5. Compute SHA-256 hash
6. Encode as 64-character lowercase hex string

**Properties:**
- Vault ID is **deterministic** (same inputs → same ID)
- Vault ID is **unique** (different inputs → different ID with high probability)
- Vault ID is **content-addressed** (changes if SEAL, metadata, or txid changes)

---

## 5) The Four Operations **(normative)**

### 5.1 seal() — Create SEAL

**Input:**
- `payload`: Uint8Array (data to encrypt)
- `key`: Uint8Array (32 bytes, encryption key)
- `options`: { algorithm?, metadataHint?, nonce? }

**Output:**
- `SealFile` object

**Process:**
1. Generate random nonce (12 bytes for AES-GCM) if not provided
2. Encrypt payload with AES-256-GCM using key and nonce
3. Extract ciphertext and authentication tag
4. Create SealFile object with all components
5. Return SealFile

**Requirements:**
- `key` MUST be exactly 32 bytes
- `nonce` MUST be unique for each seal with same key
- `metadataHint` MUST be ≤ 256 bytes if provided

### 5.2 bind() — Anchor to Blockchain

**Input:**
- `seal`: SealFile
- `metadata`: VaultMetadata (without txid)
- `encryptedMetadata`: Uint8Array
- `wallet`: Bitcoin wallet interface

**Output:**
- `txid`: string (binding transaction ID)

**Process:**
1. Create PSBT for self-spend transaction
2. Select UTXOs from authorized wallet
3. Create output sending to same wallet (minus fee)
4. Sign PSBT with wallet
5. Broadcast transaction
6. Wait for confirmation (≥ 1 conf)
7. Return txid

**Requirements:**
- Transaction MUST be from `metadata.authorizedWallet`
- Transaction MUST have ≥ 1 confirmation before vault is usable
- Transaction MUST NOT be RBF-enabled
- Fee rate SHOULD be ≥ 1 sat/vB

### 5.3 unseal() — Decrypt with PoA

**Input:**
- `seal`: SealFile
- `key`: Uint8Array (32 bytes)
- `poaTx`: Bitcoin transaction
- `metadata`: VaultMetadata

**Output:**
- `payload`: Uint8Array (decrypted data)

**Process:**
1. Validate PoA transaction against metadata (§6)
2. If validation fails, reject with error
3. Decrypt SEAL ciphertext with key
4. Verify authentication tag
5. Return decrypted payload

**Requirements:**
- PoA validation MUST pass all checks (§6)
- Decryption MUST verify authentication tag
- Unlock counter MUST be incremented (if limit set)

### 5.4 rebind() — Transfer Access

**Input:**
- `vault`: Vault (existing)
- `newMetadata`: VaultMetadata (new rules, without txid)
- `wallet`: Bitcoin wallet interface

**Output:**
- `newTxid`: string (new binding transaction ID)

**Process:**
1. Create new binding transaction per §5.2
2. Broadcast and confirm
3. Create new Vault with same SEAL, new metadata, new txid
4. Compute new Vault ID
5. Return new txid

**Requirements:**
- SEAL MUST NOT change (same ciphertext, nonce, tag)
- New binding transaction MUST be from `newMetadata.authorizedWallet`
- Old vault remains valid (rebinding doesn't invalidate original)

---

## 6) Proof-of-Access Validation **(normative)**

A PoA transaction MUST satisfy ALL of the following conditions:

### 6.1 Confirmation Check
- Transaction MUST have ≥ 1 confirmation
- Block height MUST be known

### 6.2 RBF Check
- Transaction MUST NOT be RBF-enabled (BIP-125)
- All inputs MUST have sequence ≥ 0xFFFFFFFE

### 6.3 Wallet Match
- At least one input MUST be from `metadata.authorizedWallet`
- If `authorizedWallet` is array, ANY address in array satisfies
- If `authorizedWallet` is `"ANY"`, this check passes

### 6.4 Recipient Match (if specified)
- If `metadata.recipientWallet` is set:
  - If `"self"`: output MUST be to same address as input
  - If address: output MUST be to specified address
- Amount sent to recipient MUST satisfy amount condition

### 6.5 Amount Match
- **Fixed:** Output amount MUST equal `amountCondition.amount`
- **Range:** Output amount MUST be ≥ `min` and ≤ `max`

### 6.6 Time Lock (if specified)
- If `metadata.timeLock` is set:
  - Transaction block height MUST be ≥ `timeLock`

### 6.7 Unlock Limit (if specified)
- If `metadata.unlockLimit` is set:
  - Current unlock count MUST be < `unlockLimit`
  - After successful unseal, increment counter

**Validation Result:**

```typescript
{
  valid: boolean,
  errors: string[],
  warnings: string[],
  details: {
    walletMatch: boolean,
    recipientMatch: boolean,
    amountMatch: boolean,
    timeLockSatisfied: boolean,
    unlockLimitOk: boolean,
    txConfirmed: boolean,
    notRbf: boolean
  }
}
```

---

## 7) Key Derivation **(normative)**

LOCK uses ECDH + HKDF for deriving encryption keys:

### 7.1 ECDH Shared Secret

**Process:**
1. Creator generates ephemeral secp256k1 keypair
2. Perform ECDH with recipient's public key
3. Result is 32-byte shared secret

### 7.2 HKDF Key Derivation

**Metadata Key:**
```
metadataKey = HKDF-SHA256(
  ikm: shared_secret,
  salt: "LOCK-METADATA",
  info: "metadata-encryption-v1" || seal_hash,
  length: 32
)
```

**SEAL Key:**
```
sealKey = HKDF-SHA256(
  ikm: shared_secret,
  salt: "LOCK-SEAL",
  info: "seal-encryption-v1" || seal_hash,
  length: 32
)
```

**Where:**
- `seal_hash` = SHA-256(SEAL_bytes)
- `||` = concatenation

**Requirements:**
- Shared secret MUST be 32 bytes
- HKDF MUST use SHA-256
- Salt and info strings MUST be exact UTF-8 bytes as specified
- Output keys MUST be exactly 32 bytes

---

## 8) Security Considerations **(normative)**

### 8.1 Nonce Uniqueness
- Nonces MUST be unique for each SEAL with the same key
- Implementations SHOULD use cryptographically secure random nonces
- Nonce reuse with same key BREAKS security

### 8.2 Key Management
- Encryption keys MUST be 32 bytes of cryptographically secure random data
- Keys MUST be stored securely (never in plaintext on disk)
- Keys SHOULD be derived from user-controlled secrets when possible

### 8.3 PoA Replay Protection
- Unlock counters MUST be persisted across sessions
- Same PoA transaction MUST NOT be accepted twice
- Implementations SHOULD track used txids per vault

### 8.4 RBF Protection
- PoA transactions MUST NOT be RBF-enabled
- Implementations MUST reject transactions with any input sequence < 0xFFFFFFFE

### 8.5 Metadata Privacy
- Metadata is encrypted but SEAL file size reveals payload size
- Implementations SHOULD pad payloads to standard sizes if privacy is critical
- Metadata hints are plaintext and MUST NOT contain sensitive data

---

## 9) Error Handling **(normative)**

Implementations MUST return specific error codes for failure cases:

| Error Code | Condition |
|------------|-----------|
| `INVALID_SEAL_FORMAT` | SEAL binary format invalid |
| `INVALID_SEAL_MAGIC` | Magic bytes ≠ "SEAL" |
| `INVALID_SEAL_VERSION` | Unsupported version |
| `ENCRYPTION_FAILED` | Encryption operation failed |
| `DECRYPTION_FAILED` | Decryption operation failed |
| `INTEGRITY_CHECK_FAILED` | Authentication tag mismatch |
| `INVALID_METADATA` | Metadata JSON invalid or missing required fields |
| `POA_VALIDATION_FAILED` | PoA transaction doesn't satisfy rules |
| `WALLET_MISMATCH` | PoA not from authorized wallet |
| `AMOUNT_MISMATCH` | PoA amount doesn't satisfy condition |
| `TIME_LOCK_NOT_MET` | PoA before time lock height |
| `UNLOCK_LIMIT_EXCEEDED` | Too many unseals |
| `TX_NOT_CONFIRMED` | PoA transaction unconfirmed |
| `TX_IS_RBF` | PoA transaction is RBF-enabled |

---

## 10) Conformance **(normative)**

A conforming LOCK implementation MUST:

1. Support AES-256-GCM encryption (algorithm ID `0x01`)
2. Serialize SEAL files per §2.1 binary format
3. Encrypt/decrypt metadata per §3.3
4. Compute Vault IDs per §4.2
5. Implement all four operations: seal(), bind(), unseal(), rebind()
6. Validate PoA transactions per §6 (all checks)
7. Derive keys per §7 (ECDH + HKDF)
8. Return specified error codes per §9

A conforming implementation MAY:

1. Support ChaCha20-Poly1305 (algorithm ID `0x02`)
2. Implement additional amount condition types
3. Add custom metadata fields (MUST preserve unknown fields)
4. Implement UI/UX features beyond protocol requirements

---

**End of Normative Specification**

