# LOCK Protocol v1.0 — Vault Container Format Specification

**Profile:** `lock-v1-taproot-adaptor`  
**Format Version:** 1.0.0

---

## 1. Overview

### 1.1 Purpose

Defines the canonical serialization format for LOCK vault containers, ensuring:
- **Interoperability:** Vaults created by one implementation can be unsealed by another
- **Integrity:** Tamper-evident structure with cryptographic bindings
- **Portability:** Human-readable JSON for easy transmission and storage
- **Extensibility:** Forward-compatible versioning for future protocol upgrades

### 1.2 Design Principles

- **JSON-based:** UTF-8 encoded, human-readable, widely supported
- **Explicit typing:** All fields have defined types and constraints
- **Canonical ordering:** Deterministic field order for hashing/signing
- **No secrets:** Vault contains only ciphertext and public metadata
- **Self-describing:** Version field enables format detection

---

## 2. Container Structure

### 2.1 Top-Level Schema

```json
{
  "version": string,
  "vaultId": hex_string,
  "state": string,
  "rules": object,
  "outputCommitment": hex_string,
  "challengeUtxo": object,
  "adaptor": object,
  "cipher": object,
  "kdfLabels": object,
  "meta": object
}
```

**Field Order:** As listed above (canonical order for serialization)

**Required Fields:** All fields are required; omission is an error

**Unknown Fields:** Implementations MUST reject vaults with unknown top-level fields

---

## 3. Field Specifications

### 3.1 `version` (string)

**Purpose:** Protocol version identifier

**Format:** `"lock-v{major}-{profile}"`

**Example:** `"lock-v1-taproot-adaptor"`

**Constraints:**
- MUST match regex: `^lock-v[0-9]+-[a-z0-9-]+$`
- Implementations MUST reject unknown versions
- Future versions: `lock-v2-*`, `lock-v3-*`, etc.

**Validation:**
```javascript
if (vault.version !== "lock-v1-taproot-adaptor") {
  throw new Error("Unsupported vault version");
}
```

---

### 3.2 `vaultId` (hex_string)

**Purpose:** Globally unique vault identifier

**Format:** 64-character lowercase hex string (32 bytes)

**Generation:** Cryptographically secure random bytes

**Example:** `"a1b2c3d4e5f6..."`

**Constraints:**
- Length: exactly 64 characters
- Characters: `[0-9a-f]` only
- MUST be globally unique (collision probability negligible)

**Validation:**
```javascript
if (!/^[0-9a-f]{64}$/.test(vault.vaultId)) {
  throw new Error("Invalid vaultId format");
}
```

---

### 3.3 `state` (string)

**Purpose:** Vault lifecycle state

**Format:** Enum string

**Allowed Values:**
- `"sealed"`: Vault created, not yet unsealed (only valid state in v1.0)

**Future States (reserved):**
- `"unsealed"`: Vault successfully decrypted (not used in v1.0)
- `"revoked"`: Vault invalidated by sender (future extension)

**Constraints:**
- MUST be `"sealed"` in v1.0
- Implementations MUST reject other values

**Validation:**
```javascript
if (vault.state !== "sealed") {
  throw new Error("Invalid vault state");
}
```

---

### 3.4 `rules` (object)

**Purpose:** Proof-of-Access requirements

**Schema:**
```json
{
  "recipientP2TR": string,
  "poaAmountSats": integer,
  "poaMinConfs": integer,
  "poaTimeLock": integer | null,
  "network": string
}
```

#### 3.4.1 `recipientP2TR` (string)

**Format:** Bech32m-encoded Taproot address

**Example:** `"bc1p..."`

**Constraints:**
- MUST be valid Bech32m with witness version 1
- Mainnet: prefix `bc1p`
- Testnet: prefix `tb1p`
- Signet: prefix `tb1p`
- Regtest: prefix `bcrt1p`

**Validation:**
```javascript
const decoded = bech32m.decode(rules.recipientP2TR);
if (decoded.version !== 1 || decoded.program.length !== 32) {
  throw new Error("Invalid P2TR address");
}
```

#### 3.4.2 `poaAmountSats` (integer)

**Format:** Positive integer (satoshis)

**Constraints:**
- Minimum: 546 (P2PKH dust limit) or 330 (P2TR dust limit)
- Maximum: 2,100,000,000,000,000 (21M BTC in sats)
- MUST be exact match for PoA output

**Validation:**
```javascript
if (rules.poaAmountSats < 330 || rules.poaAmountSats > 2.1e15) {
  throw new Error("Invalid PoA amount");
}
```

#### 3.4.3 `poaMinConfs` (integer)

**Format:** Positive integer

**Constraints:**
- Minimum: 1
- Maximum: 1000 (practical limit)
- Recommended: 6 for mainnet, 1 for testnet

**Validation:**
```javascript
if (rules.poaMinConfs < 1 || rules.poaMinConfs > 1000) {
  throw new Error("Invalid confirmation requirement");
}
```

#### 3.4.4 `poaTimeLock` (integer | null)

**Format:** Unix timestamp (seconds since epoch) or `null`

**Constraints:**
- If integer: MUST be > 1609459200 (2021-01-01, sanity check)
- If integer: SHOULD be > current time at seal
- If `null`: no timelock requirement

**Validation:**
```javascript
if (rules.poaTimeLock !== null) {
  if (rules.poaTimeLock < 1609459200) {
    throw new Error("Invalid timelock (too far in past)");
  }
}
```

#### 3.4.5 `network` (string)

**Format:** Enum string

**Allowed Values:**
- `"mainnet"`: Bitcoin mainnet
- `"testnet"`: Bitcoin testnet3
- `"signet"`: Bitcoin signet
- `"regtest"`: Bitcoin regtest (local development)

**Constraints:**
- MUST match wallet network during unseal
- MUST match `recipientP2TR` address prefix

**Validation:**
```javascript
const validNetworks = ["mainnet", "testnet", "signet", "regtest"];
if (!validNetworks.includes(rules.network)) {
  throw new Error("Invalid network");
}
```

---

### 3.5 `outputCommitment` (hex_string)

**Purpose:** Cryptographic binding to PoA transaction output

**Format:** 64-character lowercase hex string (32 bytes, SHA-256 hash)

**Computation:**
```
outputCommitment = SHA256_tagged(
  tag = "LOCK/outputCommitment",
  data = scriptPubKey || BE64(poaAmountSats) || network_byte
)
```

**Example:** `"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"`

**Validation:**
```javascript
if (!/^[0-9a-f]{64}$/.test(vault.outputCommitment)) {
  throw new Error("Invalid outputCommitment format");
}
```

---

### 3.6 `challengeUtxo` (object)

**Purpose:** Reference to sender-funded Challenge UTXO

**Schema:**
```json
{
  "txid": string,
  "vout": integer,
  "value": integer,
  "scriptPubKey": string,
  "descriptor": string | null
}
```

#### 3.6.1 `txid` (string)

**Format:** 64-character lowercase hex string (32 bytes, reversed)

**Example:** `"a1b2c3d4..."`

**Validation:**
```javascript
if (!/^[0-9a-f]{64}$/.test(challengeUtxo.txid)) {
  throw new Error("Invalid txid format");
}
```

#### 3.6.2 `vout` (integer)

**Format:** Non-negative integer (output index)

**Constraints:**
- Minimum: 0
- Maximum: 65535 (practical limit)

**Validation:**
```javascript
if (vout < 0 || vout > 65535) {
  throw new Error("Invalid vout");
}
```

#### 3.6.3 `value` (integer)

**Format:** Positive integer (satoshis)

**Constraints:**
- Minimum: 330 (P2TR dust limit)
- Typical: 330-1000 sats

**Validation:**
```javascript
if (value < 330) {
  throw new Error("Challenge UTXO below dust limit");
}
```

#### 3.6.4 `scriptPubKey` (string)

**Format:** Hex-encoded P2TR output script

**Example:** `"5120a1b2c3d4..."` (34 bytes: `0x5120` + 32-byte pubkey)

**Constraints:**
- Length: 68 characters (34 bytes)
- Prefix: `5120` (OP_1 + 32-byte push)

**Validation:**
```javascript
if (!/^5120[0-9a-f]{64}$/.test(scriptPubKey)) {
  throw new Error("Invalid P2TR scriptPubKey");
}
```

#### 3.6.5 `descriptor` (string | null)

**Format:** Bitcoin output descriptor (optional)

**Example:** `"tr(a1b2c3d4...)"`

**Purpose:** Aids wallet UTXO tracking (not cryptographically required)

---

### 3.7 `adaptor` (object)

**Purpose:** Adaptor signature commitment and extraction template

**Schema:**
```json
{
  "T_xonly": string,
  "spendTemplate": object
}
```

#### 3.7.1 `T_xonly` (string)

**Format:** 64-character lowercase hex string (32 bytes, x-only pubkey)

**Purpose:** Commitment to adaptor secret `k` (where `T = k·G`)

**Example:** `"a1b2c3d4..."`

**Validation:**
```javascript
if (!/^[0-9a-f]{64}$/.test(adaptor.T_xonly)) {
  throw new Error("Invalid T_xonly format");
}
```

#### 3.7.2 `spendTemplate` (object)

**Schema:**
```json
{
  "psbt": string,
  "nonce_R": string,
  "pre_sig_s": string
}
```

**Fields:**
- `psbt`: Base64-encoded PSBT for Challenge spend
- `nonce_R`: 64-char hex (32 bytes, x-only nonce point)
- `pre_sig_s`: 64-char hex (32 bytes, pre-signature scalar)

**Validation:**
```javascript
if (!/^[A-Za-z0-9+/]+=*$/.test(spendTemplate.psbt)) {
  throw new Error("Invalid PSBT encoding");
}
if (!/^[0-9a-f]{64}$/.test(spendTemplate.nonce_R)) {
  throw new Error("Invalid nonce_R format");
}
if (!/^[0-9a-f]{64}$/.test(spendTemplate.pre_sig_s)) {
  throw new Error("Invalid pre_sig_s format");
}
```

---

### 3.8 `cipher` (object)

**Purpose:** Encrypted payload and master key

**Schema:**
```json
{
  "encPayload": string,
  "payloadNonce": string,
  "payloadTag": string,
  "encMasterKey": string,
  "masterKeyNonce": string,
  "masterKeyTag": string
}
```

#### 3.8.1 Payload Fields

- `encPayload`: Base64-encoded ciphertext (variable length)
- `payloadNonce`: 24-char hex (12 bytes)
- `payloadTag`: 32-char hex (16 bytes, AEAD tag)

**Validation:**
```javascript
if (!/^[A-Za-z0-9+/]+=*$/.test(cipher.encPayload)) {
  throw new Error("Invalid encPayload encoding");
}
if (!/^[0-9a-f]{24}$/.test(cipher.payloadNonce)) {
  throw new Error("Invalid payloadNonce format");
}
if (!/^[0-9a-f]{32}$/.test(cipher.payloadTag)) {
  throw new Error("Invalid payloadTag format");
}
```

#### 3.8.2 Master Key Fields

- `encMasterKey`: Base64-encoded ciphertext (44 chars for 32-byte key)
- `masterKeyNonce`: 24-char hex (12 bytes)
- `masterKeyTag`: 32-char hex (16 bytes, AEAD tag)

**Validation:**
```javascript
if (!/^[A-Za-z0-9+/]+=*$/.test(cipher.encMasterKey)) {
  throw new Error("Invalid encMasterKey encoding");
}
if (!/^[0-9a-f]{24}$/.test(cipher.masterKeyNonce)) {
  throw new Error("Invalid masterKeyNonce format");
}
if (!/^[0-9a-f]{32}$/.test(cipher.masterKeyTag)) {
  throw new Error("Invalid masterKeyTag format");
}
```

---

### 3.9 `kdfLabels` (object)

**Purpose:** HKDF domain separation labels

**Schema:**
```json
{
  "temp": "LOCK-v1-TEMP",
  "bind": "LOCK-v1-BIND",
  "unseal": "LOCK-v1-UNSEAL"
}
```

**Constraints:**
- MUST match exactly (case-sensitive)
- Enables future protocol versions to use different labels

**Validation:**
```javascript
if (kdfLabels.temp !== "LOCK-v1-TEMP" ||
    kdfLabels.bind !== "LOCK-v1-BIND" ||
    kdfLabels.unseal !== "LOCK-v1-UNSEAL") {
  throw new Error("Invalid KDF labels");
}
```

---

### 3.10 `meta` (object)

**Purpose:** Optional metadata (not cryptographically binding)

**Schema:**
```json
{
  "createdAt": string,
  "mimeType": string | null,
  "notes": string | null
}
```

#### 3.10.1 `createdAt` (string)

**Format:** ISO 8601 timestamp with timezone

**Example:** `"2024-01-15T12:34:56.789Z"`

**Validation:**
```javascript
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(meta.createdAt)) {
  throw new Error("Invalid createdAt format");
}
```

#### 3.10.2 `mimeType` (string | null)

**Format:** MIME type string or `null`

**Example:** `"application/pdf"`, `"text/plain"`, `null`

**Purpose:** Hints at payload content type (not enforced)

#### 3.10.3 `notes` (string | null)

**Format:** Arbitrary UTF-8 string or `null`

**Purpose:** Human-readable description (not cryptographically binding)

**Constraints:**
- Maximum length: 1000 characters (recommended)

---

## 4. Serialization Rules

### 4.1 Canonical JSON

**Encoding:** UTF-8 without BOM

**Whitespace:** Implementations MAY use pretty-printing (2-space indent) or compact (no whitespace)

**Field Order:** MUST follow canonical order (as specified in section 3)

**Number Encoding:** Integers as JSON numbers (no quotes)

**String Encoding:** Escape special characters per JSON spec (RFC 8259)

### 4.2 File Extension

**Recommended:** `.lock` or `.json`

**Example:** `vault-a1b2c3d4.lock`

### 4.3 MIME Type

**Recommended:** `application/vnd.lock.vault+json`

**Fallback:** `application/json`

---

## 5. Validation Checklist

Implementations MUST validate:

- [ ] `version` matches `"lock-v1-taproot-adaptor"`
- [ ] `vaultId` is 64-char hex
- [ ] `state` is `"sealed"`
- [ ] `recipientP2TR` is valid Bech32m P2TR address
- [ ] `poaAmountSats` ≥ 330 and ≤ 2.1e15
- [ ] `poaMinConfs` ≥ 1 and ≤ 1000
- [ ] `poaTimeLock` is null or valid Unix timestamp
- [ ] `network` is valid enum value
- [ ] `outputCommitment` is 64-char hex
- [ ] `challengeUtxo.txid` is 64-char hex
- [ ] `challengeUtxo.vout` ≥ 0
- [ ] `challengeUtxo.value` ≥ 330
- [ ] `challengeUtxo.scriptPubKey` is valid P2TR script
- [ ] `adaptor.T_xonly` is 64-char hex
- [ ] `adaptor.spendTemplate.psbt` is valid Base64
- [ ] `adaptor.spendTemplate.nonce_R` is 64-char hex
- [ ] `adaptor.spendTemplate.pre_sig_s` is 64-char hex
- [ ] `cipher.encPayload` is valid Base64
- [ ] `cipher.payloadNonce` is 24-char hex
- [ ] `cipher.payloadTag` is 32-char hex
- [ ] `cipher.encMasterKey` is valid Base64
- [ ] `cipher.masterKeyNonce` is 24-char hex
- [ ] `cipher.masterKeyTag` is 32-char hex
- [ ] `kdfLabels` match expected values
- [ ] `meta.createdAt` is valid ISO 8601
- [ ] No unknown top-level fields

---

## 6. Future-Proofing

### 6.1 Version Negotiation

**Current:** `lock-v1-taproot-adaptor`

**Future Versions:**
- `lock-v2-*`: May add new fields, change KDF labels, or use different cryptographic primitives
- Implementations MUST reject unknown versions (fail-safe)

### 6.2 Optional Fields (Future)

**Reserved for v2+:**
- `signatures`: Multi-party signatures
- `revocation`: Revocation tokens
- `proof`: Zero-knowledge proofs

**Handling:** v1 implementations MUST reject vaults with these fields

### 6.3 Backward Compatibility

**Policy:** No backward compatibility guaranteed across major versions

**Rationale:** Cryptographic protocols should not be extended in-place; new versions should be clean-slate

---

## 7. Reference Implementation

See `TESTPLAN.md` for canonical test vectors demonstrating correct serialization and validation.

---

**End of Format Specification**

