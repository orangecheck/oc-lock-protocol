# LOCK Protocol v1.0 — Taproot Adaptor-Locked Secret Specification

**Profile:** `lock-v1-taproot-adaptor`  
**Version:** 1.0.0  
**Status:** Implementation-Ready Draft

---

## 1. Overview

### 1.1 Purpose

LOCK (Ledger-Originated Cryptographic Key) Protocol v1.0 provides **cryptographically-enforced encryption** to a Bitcoin Taproot address, where decryption becomes possible **only after**:

1. The recipient proves address ownership via an **on-chain Taproot key-path spend** (Challenge UTXO)
2. A **Proof-of-Access (PoA) transaction** is mined with required confirmations

### 1.2 Core Innovation

Uses **Taproot adaptor signatures** (scriptless scripts) to cryptographically bind vault decryption to:
- **Discrete log extraction:** Secret scalar `k` is recoverable only after a valid Schnorr signature is broadcast
- **Block commitment:** Final decryption key incorporates the PoA block's merkle root
- **On-chain indistinguishability:** All transactions appear as standard Taproot key-path spends

### 1.3 Security Model

- **Soundness:** Without both (a) Challenge UTXO spend and (b) mined PoA block, decryption is cryptographically impossible
- **Privacy:** No custom opcodes, covenant scripts, or on-chain fingerprints
- **Forward secrecy:** Sender discards `k` after seal; cannot decrypt or track unseal events
- **Wallet compatibility:** Works with any Taproot key-path PSBT signer (browser, hardware, air-gapped)

---

## 2. Cryptographic Primitives

### 2.1 Elliptic Curve

- **Curve:** secp256k1
- **Generator:** `G` (standard secp256k1 base point)
- **Field:** 256-bit prime field
- **Scalar arithmetic:** modulo curve order `n`

### 2.2 Signatures

- **Scheme:** BIP-340 Schnorr signatures
- **Format:** 64-byte (32-byte `r` x-coordinate || 32-byte `s` scalar)
- **Signing:** Taproot **key-path** spends only (no script-path)
- **Nonce:** RFC 6979 deterministic or secure random per BIP-340

### 2.3 Adaptor Signatures

**Construction:**

1. **Setup:** Sender generates random scalar `k ∈ [1, n-1]`; computes `T = k·G` (adaptor point)
2. **Pre-signature:** Create Schnorr signature template with nonce `R' = R + T` where `R` is the true nonce point
3. **Commitment:** Store `T` (x-only, 32 bytes) and pre-signature metadata in vault
4. **Extraction:** After final signature `(r, s)` is broadcast, compute `k = s' - s` where `s'` is the pre-signature scalar

**Security:** Based on discrete logarithm hardness; extracting `k` without the final signature is computationally infeasible.

### 2.4 Key Derivation

**Function:** HKDF-SHA256 (RFC 5869)

**Parameters:**
- `ikm` (Input Keying Material): source entropy
- `salt`: domain-specific binding data
- `info`: context and version strings
- `len`: output length in bytes

**Labels:**
- `LOCK-v1-TEMP`: Temporary master key encryption during seal
- `LOCK-v1-BIND`: Final binding key derivation from adaptor secret
- `LOCK-v1-UNSEAL`: Unseal context identifier

### 2.5 Symmetric Encryption

**Cipher:** AES-256-GCM

**Parameters:**
- Key: 32 bytes (256 bits)
- Nonce: 12 bytes (96 bits, unique per encryption)
- Tag: 16 bytes (128-bit authentication tag)
- AAD (Additional Authenticated Data): vault scoping fields

**Alternative:** ChaCha20-Poly1305 (same parameters)

### 2.6 Hash Functions

- **Primary:** SHA-256
- **Tagged hashing:** BIP-340 style `SHA256(SHA256(tag) || SHA256(tag) || data)` for domain separation
- **Tags:**
  - `LOCK/outputCommitment`: PoA output binding
  - `LOCK/vaultId`: Vault identifier generation
  - `LOCK/challenge`: Challenge UTXO commitment

---

## 3. Data Structures

### 3.1 Vault Container

**Format:** JSON (UTF-8 encoded)

**Required Fields:**

```json
{
  "version": "lock-v1-taproot-adaptor",
  "vaultId": "<hex, 32 bytes>",
  "state": "sealed",
  "rules": {
    "recipientP2TR": "<bech32m address>",
    "poaAmountSats": <integer>,
    "poaMinConfs": <integer>,
    "poaTimeLock": <integer | null>,
    "network": "mainnet" | "testnet" | "signet" | "regtest"
  },
  "outputCommitment": "<hex, 32 bytes>",
  "challengeUtxo": {
    "txid": "<hex, 32 bytes>",
    "vout": <integer>,
    "value": <integer, satoshis>,
    "scriptPubKey": "<hex>",
    "descriptor": "<optional, string>"
  },
  "adaptor": {
    "T_xonly": "<hex, 32 bytes>",
    "spendTemplate": {
      "psbt": "<base64>",
      "nonce_R": "<hex, 32 bytes, x-only>",
      "pre_sig_s": "<hex, 32 bytes>"
    }
  },
  "cipher": {
    "encPayload": "<base64>",
    "payloadNonce": "<hex, 12 bytes>",
    "payloadTag": "<hex, 16 bytes>",
    "encMasterKey": "<base64>",
    "masterKeyNonce": "<hex, 12 bytes>",
    "masterKeyTag": "<hex, 16 bytes>"
  },
  "kdfLabels": {
    "temp": "LOCK-v1-TEMP",
    "bind": "LOCK-v1-BIND",
    "unseal": "LOCK-v1-UNSEAL"
  },
  "meta": {
    "createdAt": "<ISO 8601 timestamp>",
    "mimeType": "<optional>",
    "notes": "<optional>"
  }
}
```

**Field Constraints:**
- `vaultId`: Cryptographically random, globally unique
- `state`: Always `"sealed"` (no network round-trip in this profile)
- `recipientP2TR`: Valid Bech32m P2TR address for specified network
- `poaAmountSats`: ≥ 546 (dust limit), ≤ 21M BTC
- `poaMinConfs`: ≥ 1, recommended ≥ 6 for mainnet
- `poaTimeLock`: Unix timestamp or `null`; if set, PoA must be mined after this time
- `challengeUtxo.value`: ≥ 330 sats (P2TR dust limit)
- All hex fields: lowercase, no `0x` prefix
- All base64: standard encoding (RFC 4648)

### 3.2 Output Commitment

**Purpose:** Cryptographically bind vault to specific PoA transaction output

**Computation:**
```
outputCommitment = SHA256_tagged(
  tag = "LOCK/outputCommitment",
  data = scriptPubKey || BE64(amount) || network_byte
)
```

Where:
- `scriptPubKey`: Raw bytes of P2TR output script (34 bytes: `0x5120` || 32-byte x-only pubkey)
- `BE64(amount)`: 8-byte big-endian encoding of satoshi amount
- `network_byte`: `0x00` (mainnet), `0x01` (testnet), `0x02` (signet), `0x03` (regtest)

### 3.3 Challenge UTXO

**Purpose:** Tiny sender-funded P2TR output; recipient's spend enables adaptor extraction

**Properties:**
- Pays to `recipientP2TR` (standard key-path)
- Minimum value: 330 sats (P2TR dust limit)
- Indistinguishable from normal Taproot output
- Must be unspent at seal time
- Must be spent by recipient to unseal

---

## 4. Protocol Algorithms

### 4.1 SEAL (Sender, One-Time)

**Inputs:**
- `payload`: Arbitrary data to encrypt (bytes)
- `recipientP2TR`: Bech32m Taproot address
- `poaAmountSats`: Required PoA amount
- `poaMinConfs`: Required confirmations
- `poaTimeLock`: Optional Unix timestamp
- `network`: Network identifier

**Process:**

1. **Generate vault ID:**
   ```
   vaultId = random(32 bytes)
   ```

2. **Generate adaptor secret:**
   ```
   k = random_scalar() ∈ [1, n-1]
   T = k·G
   T_xonly = x_coordinate(T)  // 32 bytes
   ```

3. **Create and fund Challenge UTXO:**
   ```
   challengeTx = create_p2tr_transaction(
     recipient = recipientP2TR,
     amount = 330 sats  // or higher
   )
   broadcast(challengeTx)
   wait_for_confirmation(challengeTx, min_confs = 1)
   
   challengeUtxo = {
     txid: challengeTx.txid,
     vout: output_index,
     value: 330,
     scriptPubKey: challengeTx.outputs[output_index].scriptPubKey
   }
   ```

4. **Create adaptor pre-signature:**
   ```
   // Standard Schnorr signing setup
   r_nonce = random_scalar()
   R = r_nonce·G
   
   // Adaptor modification
   R' = R + T
   R'_xonly = x_coordinate(R')
   
   // Pre-signature scalar (without final private key)
   // This is a template; actual implementation requires
   // partial signature construction compatible with extraction
   
   spendTemplate = {
     psbt: create_psbt(challengeUtxo, recipient_key_placeholder),
     nonce_R: x_coordinate(R),  // Original nonce
     pre_sig_s: compute_pre_signature_scalar(r_nonce, k, ...)
   }
   ```

5. **Compute output commitment:**
   ```
   scriptPubKey = decode_p2tr_address(recipientP2TR).scriptPubKey
   outputCommitment = SHA256_tagged(
     "LOCK/outputCommitment",
     scriptPubKey || BE64(poaAmountSats) || network_byte
   )
   ```

6. **Encrypt payload:**
   ```
   masterKey = random(32 bytes)
   payloadNonce = random(12 bytes)
   (encPayload, payloadTag) = AES256GCM_encrypt(
     key = masterKey,
     nonce = payloadNonce,
     plaintext = payload,
     aad = vaultId || outputCommitment
   )
   ```

7. **Encrypt master key (temporary):**
   ```
   tempKey = HKDF(
     ikm = k,  // Adaptor secret
     salt = vaultId,
     info = "LOCK-v1-TEMP" || network_byte,
     len = 32
   )
   masterKeyNonce = random(12 bytes)
   (encMasterKey, masterKeyTag) = AES256GCM_encrypt(
     key = tempKey,
     nonce = masterKeyNonce,
     plaintext = masterKey,
     aad = vaultId || T_xonly
   )
   ```

8. **Assemble vault:**
   ```
   vault = {
     version: "lock-v1-taproot-adaptor",
     vaultId,
     state: "sealed",
     rules: { recipientP2TR, poaAmountSats, poaMinConfs, poaTimeLock, network },
     outputCommitment,
     challengeUtxo,
     adaptor: { T_xonly, spendTemplate },
     cipher: { encPayload, payloadNonce, payloadTag, encMasterKey, masterKeyNonce, masterKeyTag },
     kdfLabels: { temp: "LOCK-v1-TEMP", bind: "LOCK-v1-BIND", unseal: "LOCK-v1-UNSEAL" },
     meta: { createdAt: now(), ... }
   }
   ```

9. **Securely erase secrets:**
   ```
   zero_memory(k, masterKey, tempKey, r_nonce)
   ```

**Output:** Vault container (JSON file)

**On-chain state:** One confirmed P2TR Challenge UTXO (330+ sats)

---

### 4.2 UNSEAL (Recipient)

**Inputs:**
- `vault`: Sealed vault container
- `walletSigner`: Function to sign PSBTs (browser/hardware/air-gapped)
- `blockchainProvider`: Function to fetch transactions and block headers

**Process:**

1. **Validate vault structure:**
   ```
   assert vault.version == "lock-v1-taproot-adaptor"
   assert vault.state == "sealed"
   assert all required fields present
   assert recipientP2TR matches wallet address
   ```

2. **Create and broadcast PoA transaction:**
   ```
   poaTx = create_transaction(
     outputs = [{
       address: vault.rules.recipientP2TR,
       amount: vault.rules.poaAmountSats
     }],
     ... // additional outputs/change
   )
   broadcast(poaTx)
   ```

3. **Wait for PoA confirmations:**
   ```
   wait_for_confirmations(poaTx, vault.rules.poaMinConfs)
   poaBlock = get_block_containing(poaTx)
   
   if vault.rules.poaTimeLock != null:
     assert poaBlock.timestamp >= vault.rules.poaTimeLock
   ```

4. **Validate PoA output commitment:**
   ```
   poaOutput = poaTx.outputs.find(o => 
     o.scriptPubKey == decode_p2tr(vault.rules.recipientP2TR).scriptPubKey &&
     o.value == vault.rules.poaAmountSats
   )
   assert poaOutput != null
   
   computedCommitment = SHA256_tagged(
     "LOCK/outputCommitment",
     poaOutput.scriptPubKey || BE64(poaOutput.value) || network_byte
   )
   assert computedCommitment == vault.outputCommitment
   ```

5. **Extract merkle root:**
   ```
   merkleRoot = poaBlock.header.merkleRoot  // 32 bytes
   ```

6. **Spend Challenge UTXO (adaptor extraction):**
   ```
   // Load pre-signature template
   psbt = decode_psbt(vault.adaptor.spendTemplate.psbt)
   
   // Sign with wallet (standard Taproot key-path)
   signedPsbt = walletSigner.sign(psbt)
   finalTx = finalize_psbt(signedPsbt)
   
   // Extract final signature
   witness = finalTx.inputs[0].witness
   finalSignature = witness[0]  // 64 bytes: r || s
   final_s = finalSignature[32:64]
   
   // Broadcast
   broadcast(finalTx)
   wait_for_confirmation(finalTx, min_confs = 1)
   ```

7. **Extract adaptor secret `k`:**
   ```
   pre_sig_s = vault.adaptor.spendTemplate.pre_sig_s
   k = (pre_sig_s - final_s) mod n
   
   // Verify extraction
   T_computed = k·G
   assert x_coordinate(T_computed) == vault.adaptor.T_xonly
   ```

8. **Derive final unseal key:**
   ```
   K_final = HKDF(
     ikm = k,
     salt = merkleRoot || vault.outputCommitment,
     info = vault.vaultId || "LOCK-v1-UNSEAL" || network_byte,
     len = 32
   )
   ```

9. **Decrypt master key:**
   ```
   masterKey = AES256GCM_decrypt(
     key = K_final,
     nonce = vault.cipher.masterKeyNonce,
     ciphertext = vault.cipher.encMasterKey,
     tag = vault.cipher.masterKeyTag,
     aad = vault.vaultId || vault.adaptor.T_xonly
   )
   ```

10. **Decrypt payload:**
    ```
    payload = AES256GCM_decrypt(
      key = masterKey,
      nonce = vault.cipher.payloadNonce,
      ciphertext = vault.cipher.encPayload,
      tag = vault.cipher.payloadTag,
      aad = vault.vaultId || vault.outputCommitment
    )
    ```

11. **Securely erase secrets:**
    ```
    zero_memory(k, K_final, masterKey)
    ```

**Output:** Decrypted payload (bytes)

**On-chain state:** Two spent UTXOs (Challenge + PoA)

---

## 5. Security Analysis

### 5.1 Cryptographic Guarantees

**Theorem (Soundness):** Decryption is computationally infeasible without:
1. Knowledge of the private key corresponding to `recipientP2TR` (to spend Challenge UTXO)
2. A mined block containing a valid PoA transaction (to obtain `merkleRoot`)

**Proof sketch:**
- Without Challenge spend, `k` remains hidden (discrete log problem)
- Without `merkleRoot`, `K_final` cannot be derived (HKDF preimage resistance)
- Without `K_final`, `masterKey` cannot be decrypted (AES-GCM security)
- Without `masterKey`, `payload` cannot be decrypted (AES-GCM security)

### 5.2 Attack Resistance

| Attack Vector | Mitigation |
|---------------|------------|
| Wrong private key | Cannot produce valid Schnorr signature → Challenge spend fails |
| Signature forgery | ECDSA/Schnorr unforgeability → computationally infeasible |
| Adaptor extraction without signature | Discrete log problem → computationally infeasible |
| PoA substitution | `outputCommitment` binds to specific scriptPubKey + amount + network |
| Merkle root forgery | Requires mining a valid block → proof-of-work hardness |
| Replay attack | `vaultId` uniqueness + AAD binding prevents cross-vault replay |
| Network confusion | `network_byte` in commitments and KDF info |
| Vault tampering | AEAD tags authenticate all ciphertext and AAD |
| Reorg attack | Require sufficient `poaMinConfs`; revalidate on reorg |

### 5.3 Privacy Properties

- **On-chain indistinguishability:** Challenge and PoA outputs are standard P2TR key-path spends
- **No custom scripts:** No covenant opcodes, multisig reveals, or timelock scripts
- **Minimal linkability:** Challenge and PoA transactions are independent; no on-chain connection
- **Forward secrecy:** Sender cannot decrypt after seal (k is erased)
- **Recipient anonymity:** No identity revelation beyond standard Bitcoin address reuse

---

## 6. Error Handling

### 6.1 Validation Errors

| Error Code | Condition | User Message |
|------------|-----------|--------------|
| `ERR_VAULT_VERSION` | Unknown version | "Unsupported vault version" |
| `ERR_VAULT_STRUCTURE` | Missing/invalid fields | "Corrupted vault file" |
| `ERR_NETWORK_MISMATCH` | Vault network ≠ wallet network | "Network mismatch (mainnet/testnet)" |
| `ERR_ADDRESS_MISMATCH` | Recipient address ≠ wallet address | "Vault not addressed to this wallet" |

### 6.2 PoA Errors

| Error Code | Condition | User Message |
|------------|-----------|--------------|
| `ERR_POA_NOT_FOUND` | PoA transaction not in mempool/chain | "PoA transaction not found" |
| `ERR_POA_INSUFFICIENT_CONFS` | Confirmations < `poaMinConfs` | "Waiting for N more confirmations" |
| `ERR_POA_TIMELOCK` | Block timestamp < `poaTimeLock` | "PoA mined before timelock expiry" |
| `ERR_POA_OUTPUT_MISMATCH` | No output matches commitment | "PoA output does not match vault rules" |
| `ERR_POA_REORG` | PoA block orphaned | "Blockchain reorganization detected; revalidate PoA" |

### 6.3 Challenge Errors

| Error Code | Condition | User Message |
|------------|-----------|--------------|
| `ERR_CHALLENGE_SPENT` | Challenge UTXO already spent | "Challenge UTXO already consumed" |
| `ERR_CHALLENGE_SIGN_FAIL` | Wallet refuses to sign | "Wallet signature failed" |
| `ERR_CHALLENGE_BROADCAST_FAIL` | Network rejects transaction | "Challenge spend broadcast failed" |
| `ERR_ADAPTOR_EXTRACTION_FAIL` | Cannot extract `k` from signature | "Adaptor secret extraction failed" |
| `ERR_ADAPTOR_VERIFY_FAIL` | Extracted `k` doesn't match `T` | "Invalid adaptor secret" |

### 6.4 Decryption Errors

| Error Code | Condition | User Message |
|------------|-----------|--------------|
| `ERR_DECRYPT_MASTER_KEY` | AEAD tag verification fails | "Master key decryption failed (wrong key or corrupted data)" |
| `ERR_DECRYPT_PAYLOAD` | AEAD tag verification fails | "Payload decryption failed (wrong key or corrupted data)" |

---

## 7. Implementation Requirements

### 7.1 Mandatory Features

- BIP-340 Schnorr signature generation and verification
- Taproot P2TR address encoding/decoding (Bech32m)
- PSBT creation, signing, and finalization (BIP-174, BIP-371)
- HKDF-SHA256 (RFC 5869)
- AES-256-GCM with AAD
- Secure random number generation (CSPRNG)
- Constant-time scalar arithmetic (timing attack resistance)
- Secure memory zeroing

### 7.2 Blockchain Integration

- Transaction broadcast and confirmation monitoring
- Block header retrieval and merkle root extraction
- UTXO set queries (check Challenge UTXO spent status)
- Reorg detection and handling

### 7.3 Wallet Integration

- Standard Taproot key-path PSBT signing (no custom APIs)
- Air-gapped support: QR codes (UR encoding), USB, SD card
- Browser wallet APIs: `window.unisat`, `window.xverse`, etc.
- Hardware wallet support: Ledger, Trezor, Coldcard (via PSBT)

---

## 8. Test Vectors

See `TESTPLAN.md` for comprehensive test vectors and validation procedures.

---

## 9. References

- **BIP-340:** Schnorr Signatures for secp256k1
- **BIP-341:** Taproot: SegWit version 1 spending rules
- **BIP-342:** Validation of Taproot Scripts
- **BIP-174:** Partially Signed Bitcoin Transaction Format
- **BIP-371:** Taproot Fields for PSBT
- **RFC 5869:** HKDF (HMAC-based Key Derivation Function)
- **RFC 6979:** Deterministic Usage of DSA and ECDSA
- **NIST SP 800-38D:** AES-GCM specification

---

**End of Specification**

