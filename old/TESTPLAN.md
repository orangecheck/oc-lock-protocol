# LOCK Protocol v1.0 — Test Plan and Validation Procedures

**Profile:** `lock-v1-taproot-adaptor`  
**Purpose:** Comprehensive test vectors and validation procedures for implementation verification

---

## 1. Test Vector Structure

### 1.1 Deterministic Test Vectors

All test vectors use **deterministic** inputs to enable cross-implementation verification:

- **Fixed `vaultId`:** `0x0101010101010101010101010101010101010101010101010101010101010101`
- **Fixed adaptor secret `k`:** `0x0202020202020202020202020202020202020202020202020202020202020202`
- **Fixed master key:** `0x0303030303030303030303030303030303030303030303030303030303030303`
- **Fixed nonces:** Deterministic per-operation
- **Synthetic blockchain data:** Pre-computed block headers and transactions

### 1.2 Test Categories

1. **Cryptographic Primitives:** HKDF, AES-GCM, SHA-256, secp256k1 operations
2. **Vault Serialization:** JSON encoding/decoding, field validation
3. **Seal Operation:** End-to-end vault creation
4. **Unseal Operation:** End-to-end vault decryption
5. **Negative Tests:** Invalid inputs, tampering, wrong keys
6. **Edge Cases:** Boundary values, reorgs, timelock edge cases
7. **Interoperability:** Cross-implementation vault exchange

---

## 2. Cryptographic Primitive Tests

### 2.1 HKDF-SHA256

**Test Vector 1: Temporary Key Derivation**

```
Input:
  ikm = 0x0202020202020202020202020202020202020202020202020202020202020202 (k)
  salt = 0x0101010101010101010101010101010101010101010101010101010101010101 (vaultId)
  info = "LOCK-v1-TEMP" || 0x00 (mainnet)
  len = 32

Expected Output:
  tempKey = 0x... (compute with RFC 5869 HKDF-SHA256)
```

**Test Vector 2: Final Unseal Key Derivation**

```
Input:
  ikm = 0x0202020202020202020202020202020202020202020202020202020202020202 (k)
  salt = merkleRoot || outputCommitment
    merkleRoot = 0x4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b
    outputCommitment = 0x... (compute from test PoA output)
  info = vaultId || "LOCK-v1-UNSEAL" || 0x00
  len = 32

Expected Output:
  K_final = 0x... (compute with RFC 5869 HKDF-SHA256)
```

### 2.2 AES-256-GCM

**Test Vector 1: Payload Encryption**

```
Input:
  key = 0x0303030303030303030303030303030303030303030303030303030303030303
  nonce = 0x040404040404040404040404
  plaintext = "Hello, LOCK Protocol!" (UTF-8)
  aad = vaultId || outputCommitment

Expected Output:
  ciphertext = 0x... (AES-256-GCM encrypt)
  tag = 0x... (16 bytes)
```

**Test Vector 2: Master Key Encryption**

```
Input:
  key = tempKey (from HKDF test vector 1)
  nonce = 0x050505050505050505050505
  plaintext = 0x0303030303030303030303030303030303030303030303030303030303030303
  aad = vaultId || T_xonly

Expected Output:
  ciphertext = 0x... (AES-256-GCM encrypt)
  tag = 0x... (16 bytes)
```

### 2.3 SHA-256 Tagged Hashing

**Test Vector: Output Commitment**

```
Input:
  tag = "LOCK/outputCommitment"
  scriptPubKey = 0x5120... (P2TR output script, 34 bytes)
  amount = 100000 (sats)
  network = 0x00 (mainnet)

Computation:
  tag_hash = SHA256("LOCK/outputCommitment")
  data = scriptPubKey || BE64(100000) || 0x00
  outputCommitment = SHA256(tag_hash || tag_hash || data)

Expected Output:
  outputCommitment = 0x... (32 bytes)
```

### 2.4 secp256k1 Operations

**Test Vector 1: Adaptor Point Computation**

```
Input:
  k = 0x0202020202020202020202020202020202020202020202020202020202020202

Computation:
  T = k·G (secp256k1 point multiplication)
  T_xonly = x_coordinate(T)

Expected Output:
  T_xonly = 0x... (32 bytes)
```

**Test Vector 2: Adaptor Extraction**

```
Input:
  pre_sig_s = 0x... (from spendTemplate)
  final_sig_s = 0x... (from on-chain signature)
  n = secp256k1 curve order

Computation:
  k_extracted = (pre_sig_s - final_sig_s) mod n

Expected Output:
  k_extracted = 0x0202020202020202020202020202020202020202020202020202020202020202
```

---

## 3. Vault Serialization Tests

### 3.1 Valid Vault Parsing

**Test Vector: Minimal Valid Vault**

```json
{
  "version": "lock-v1-taproot-adaptor",
  "vaultId": "0101010101010101010101010101010101010101010101010101010101010101",
  "state": "sealed",
  "rules": {
    "recipientP2TR": "bc1p...",
    "poaAmountSats": 100000,
    "poaMinConfs": 6,
    "poaTimeLock": null,
    "network": "mainnet"
  },
  "outputCommitment": "...",
  "challengeUtxo": {
    "txid": "...",
    "vout": 0,
    "value": 330,
    "scriptPubKey": "5120...",
    "descriptor": null
  },
  "adaptor": {
    "T_xonly": "...",
    "spendTemplate": {
      "psbt": "...",
      "nonce_R": "...",
      "pre_sig_s": "..."
    }
  },
  "cipher": {
    "encPayload": "...",
    "payloadNonce": "040404040404040404040404",
    "payloadTag": "...",
    "encMasterKey": "...",
    "masterKeyNonce": "050505050505050505050505",
    "masterKeyTag": "..."
  },
  "kdfLabels": {
    "temp": "LOCK-v1-TEMP",
    "bind": "LOCK-v1-BIND",
    "unseal": "LOCK-v1-UNSEAL"
  },
  "meta": {
    "createdAt": "2024-01-15T12:34:56.789Z",
    "mimeType": "text/plain",
    "notes": null
  }
}
```

**Expected:** Parse successfully, all fields validated

### 3.2 Invalid Vault Rejection

**Test Cases:**

1. **Unknown version:**
   ```json
   { "version": "lock-v2-unknown", ... }
   ```
   **Expected:** Reject with `ERR_VAULT_VERSION`

2. **Invalid vaultId (wrong length):**
   ```json
   { "vaultId": "0101", ... }
   ```
   **Expected:** Reject with `ERR_VAULT_STRUCTURE`

3. **Invalid state:**
   ```json
   { "state": "unsealed", ... }
   ```
   **Expected:** Reject with `ERR_VAULT_STRUCTURE`

4. **Invalid P2TR address:**
   ```json
   { "rules": { "recipientP2TR": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", ... }, ... }
   ```
   **Expected:** Reject with `ERR_VAULT_STRUCTURE`

5. **PoA amount below dust:**
   ```json
   { "rules": { "poaAmountSats": 100, ... }, ... }
   ```
   **Expected:** Reject with `ERR_VAULT_STRUCTURE`

6. **Wrong KDF labels:**
   ```json
   { "kdfLabels": { "temp": "WRONG", ... }, ... }
   ```
   **Expected:** Reject with `ERR_VAULT_STRUCTURE`

---

## 4. End-to-End Seal Tests

### 4.1 Deterministic Seal

**Inputs:**
- `payload`: "Hello, LOCK Protocol!" (UTF-8)
- `recipientP2TR`: `bc1p...` (deterministic test address)
- `poaAmountSats`: 100000
- `poaMinConfs`: 6
- `poaTimeLock`: null
- `network`: "mainnet"
- **Fixed randomness:** Use deterministic `vaultId`, `k`, `masterKey`, nonces

**Process:**
1. Generate `vaultId` = `0x0101...`
2. Generate `k` = `0x0202...`, compute `T_xonly`
3. Create Challenge UTXO (synthetic transaction)
4. Create adaptor pre-signature (synthetic)
5. Compute `outputCommitment`
6. Encrypt payload with `masterKey`
7. Encrypt `masterKey` with `tempKey` (derived from `k`)
8. Assemble vault JSON

**Expected Output:**
- Vault JSON matching test vector in section 3.1
- All ciphertext and tags match expected values

### 4.2 Seal with Timelock

**Inputs:**
- Same as 4.1, but `poaTimeLock`: 1705320896 (2024-01-15 12:34:56 UTC)

**Expected:**
- Vault `rules.poaTimeLock` = 1705320896
- Unseal must validate PoA block timestamp ≥ this value

---

## 5. End-to-End Unseal Tests

### 5.1 Successful Unseal

**Inputs:**
- Vault from test 4.1
- Synthetic PoA transaction:
  - Output: 100000 sats to `recipientP2TR`
  - Confirmed in block with merkle root: `0x4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b`
  - Confirmations: 6
- Synthetic Challenge spend:
  - Final signature: `(r, s)` where `s` enables extraction of `k = 0x0202...`

**Process:**
1. Validate vault structure
2. Validate PoA transaction and confirmations
3. Extract merkle root from PoA block
4. Validate output commitment
5. Extract `k` from Challenge spend signature
6. Derive `K_final` from `k` and merkle root
7. Decrypt `masterKey`
8. Decrypt payload

**Expected Output:**
- Decrypted payload: "Hello, LOCK Protocol!"

### 5.2 Unseal with Timelock

**Inputs:**
- Vault from test 4.2
- PoA block timestamp: 1705320900 (after timelock)

**Expected:**
- Unseal succeeds

**Negative Test:**
- PoA block timestamp: 1705320800 (before timelock)
- **Expected:** Reject with `ERR_POA_TIMELOCK`

---

## 6. Negative Tests

### 6.1 Wrong Private Key

**Scenario:** Attempt to unseal with different wallet (wrong private key)

**Expected:**
- Challenge spend signature fails (wallet cannot sign)
- Or: Signature succeeds but extracts wrong `k`
- Decryption fails with `ERR_DECRYPT_MASTER_KEY`

### 6.2 Tampered Output Commitment

**Scenario:** Modify `vault.outputCommitment` after seal

**Expected:**
- PoA validation fails (computed commitment ≠ stored commitment)
- Reject with `ERR_POA_OUTPUT_MISMATCH`

### 6.3 Tampered Ciphertext

**Scenario:** Flip one bit in `vault.cipher.encPayload`

**Expected:**
- AEAD tag verification fails
- Reject with `ERR_DECRYPT_PAYLOAD`

### 6.4 Tampered AAD

**Scenario:** Modify `vaultId` after seal

**Expected:**
- AEAD tag verification fails (AAD mismatch)
- Reject with `ERR_DECRYPT_MASTER_KEY` or `ERR_DECRYPT_PAYLOAD`

### 6.5 Wrong Network

**Scenario:** Vault created for mainnet, unsealed on testnet

**Expected:**
- Address validation fails (prefix mismatch)
- Reject with `ERR_NETWORK_MISMATCH`

### 6.6 Insufficient PoA Confirmations

**Scenario:** PoA has 3 confirmations, vault requires 6

**Expected:**
- Reject with `ERR_POA_INSUFFICIENT_CONFS`
- Show: "Waiting for 3 more confirmations"

### 6.7 PoA Reorg

**Scenario:** PoA confirmed in block A, then block A orphaned

**Expected:**
- Detect confirmation count decrease
- Reject with `ERR_POA_REORG`
- Wait for re-confirmation in new block B
- Extract new merkle root from block B
- Proceed with unseal using new merkle root

### 6.8 Challenge UTXO Already Spent

**Scenario:** Attempt to unseal vault twice

**Expected:**
- UTXO query shows Challenge UTXO already spent
- Reject with `ERR_CHALLENGE_SPENT`

### 6.9 Wrong Adaptor Secret

**Scenario:** Manually set `k` to wrong value during unseal

**Expected:**
- Extracted `k` doesn't match `T_xonly`
- Reject with `ERR_ADAPTOR_VERIFY_FAIL`

### 6.10 Corrupted PSBT

**Scenario:** Tamper with `vault.adaptor.spendTemplate.psbt`

**Expected:**
- PSBT parsing fails
- Reject with `ERR_VAULT_STRUCTURE`

---

## 7. Edge Cases

### 7.1 Minimum Dust Values

**Test:** Vault with `poaAmountSats = 330` (P2TR dust limit)

**Expected:** Seal and unseal succeed

### 7.2 Maximum PoA Amount

**Test:** Vault with `poaAmountSats = 2100000000000000` (21M BTC)

**Expected:** Seal succeeds (validation passes)

### 7.3 Zero-Length Payload

**Test:** Vault with empty payload (`payload = ""`)

**Expected:** Seal and unseal succeed, decrypted payload is empty string

### 7.4 Large Payload

**Test:** Vault with 10 MB payload

**Expected:** Seal and unseal succeed (may be slow)

### 7.5 Timelock at Block Timestamp Boundary

**Test:** `poaTimeLock = 1705320896`, PoA block timestamp = 1705320896 (exact match)

**Expected:** Unseal succeeds (≥ comparison)

### 7.6 Regtest Network

**Test:** Vault on regtest with instant confirmations

**Expected:** Seal and unseal succeed with `poaMinConfs = 1`

---

## 8. Interoperability Tests

### 8.1 Cross-Implementation Vault Exchange

**Procedure:**
1. Implementation A creates vault with deterministic inputs (test 4.1)
2. Export vault JSON
3. Implementation B imports vault JSON
4. Implementation B unseals vault with same synthetic blockchain data
5. Compare decrypted payloads

**Expected:** Payloads match exactly

### 8.2 PSBT Compatibility

**Procedure:**
1. Implementation A generates Challenge spend PSBT
2. Export PSBT (base64)
3. Sign PSBT with external wallet (Sparrow, Electrum, etc.)
4. Import signed PSBT to Implementation A
5. Finalize and broadcast

**Expected:** Transaction broadcasts successfully

### 8.3 Air-Gapped Workflow

**Procedure:**
1. Online device: Create vault, generate PoA PSBT
2. Export PoA PSBT as QR code (UR encoding)
3. Air-gapped device: Scan QR, sign PSBT
4. Export signed PSBT as QR code
5. Online device: Scan QR, broadcast PoA
6. Repeat for Challenge spend
7. Decrypt payload

**Expected:** Full unseal succeeds without online device having private keys

---

## 9. Performance Benchmarks

### 9.1 Seal Performance

**Metrics:**
- Time to generate vault (excluding Challenge UTXO confirmation)
- Payload sizes: 1 KB, 100 KB, 1 MB, 10 MB

**Expected:**
- 1 KB: < 100 ms
- 100 KB: < 500 ms
- 1 MB: < 2 seconds
- 10 MB: < 10 seconds

### 9.2 Unseal Performance

**Metrics:**
- Time to decrypt vault (excluding blockchain queries)
- Payload sizes: 1 KB, 100 KB, 1 MB, 10 MB

**Expected:**
- 1 KB: < 50 ms
- 100 KB: < 200 ms
- 1 MB: < 1 second
- 10 MB: < 5 seconds

### 9.3 Memory Usage

**Metrics:**
- Peak memory during seal/unseal
- Payload sizes: 1 MB, 10 MB, 100 MB

**Expected:**
- Streaming encryption/decryption (constant memory overhead)
- Peak memory ≈ 2× payload size (acceptable)

---

## 10. Security Validation

### 10.1 Constant-Time Operations

**Test:** Measure timing variance for:
- HKDF with different `ikm` values
- AES-GCM decryption with wrong key vs. right key
- Scalar arithmetic in adaptor extraction

**Expected:** Timing variance < 1% (no timing side-channels)

### 10.2 Secure Memory Zeroing

**Test:** After seal/unseal, inspect memory for:
- Adaptor secret `k`
- Master key
- Decrypted payload

**Expected:** All secrets zeroed (not present in memory dumps)

### 10.3 Randomness Quality

**Test:** Generate 1000 vaults, collect `vaultId` values

**Expected:**
- All unique (no collisions)
- Pass NIST randomness tests (entropy, distribution)

---

## 11. Compliance Checklist

Implementation MUST pass all tests in sections 2-6 to be considered compliant.

**Mandatory Tests:**
- [ ] All cryptographic primitive tests (section 2)
- [ ] Valid vault parsing (section 3.1)
- [ ] All invalid vault rejection tests (section 3.2)
- [ ] Deterministic seal (section 4.1)
- [ ] Successful unseal (section 5.1)
- [ ] All negative tests (section 6)
- [ ] Cross-implementation vault exchange (section 8.1)

**Recommended Tests:**
- [ ] Edge cases (section 7)
- [ ] Performance benchmarks (section 9)
- [ ] Security validation (section 10)

---

## 12. Test Automation

### 12.1 Unit Tests

**Coverage:**
- Each cryptographic primitive (HKDF, AES-GCM, SHA-256, secp256k1)
- Vault serialization/deserialization
- Field validation

**Framework:** Language-specific (Jest, pytest, cargo test, etc.)

### 12.2 Integration Tests

**Coverage:**
- End-to-end seal and unseal
- Blockchain interaction (mocked)
- Wallet integration (mocked)

**Framework:** Language-specific with mocking libraries

### 12.3 Regression Tests

**Coverage:**
- All test vectors from this document
- Historical bug fixes

**Execution:** Run on every commit (CI/CD)

---

**End of Test Plan**

