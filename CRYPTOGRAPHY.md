# LOCK Protocol v1.0 — Cryptographic Design Deep Dive

**Profile:** `lock-v1-taproot-adaptor`  
**Audience:** Cryptographers, security researchers, protocol designers

---

## 1. The Core Challenge

### 1.1 Problem Statement

**Goal:** Encrypt data to a Bitcoin address such that decryption requires:
1. Proof of private key ownership (via on-chain signature)
2. Proof of specific on-chain event (PoA transaction in mined block)

**Constraints:**
- Sender has only the recipient's **address** (hash of public key), not the public key itself
- Encryption must be **cryptographically enforced** (not application-level validation)
- Must work with **standard wallet APIs** (no custom signature schemes)
- Must be **privacy-preserving** (no on-chain fingerprints)

### 1.2 Why Traditional Approaches Fail

**Approach 1: Encrypt to address directly**
- ❌ Bitcoin addresses are hashes (one-way); cannot derive encryption key
- ❌ No standard "encrypt to address" primitive in Bitcoin

**Approach 2: Public key recovery from signature**
- ❌ Requires signature to exist before encryption
- ❌ Chicken-and-egg: need signature to encrypt, but recipient signs after receiving vault

**Approach 3: Encrypt with challenge, validate signature**
- ❌ Application-level validation (not cryptographic enforcement)
- ❌ Anyone with vault file can decrypt (signature is just a check)

**Approach 4: Use covenant scripts (OP_CTV, OP_VAULT)**
- ❌ Not yet activated on Bitcoin mainnet
- ❌ Reveals custom scripts on-chain (privacy leak)

---

## 2. The Adaptor Signature Solution

### 2.1 Adaptor Signatures (Scriptless Scripts)

**Definition:** A cryptographic primitive that allows:
1. **Pre-signature creation:** Commit to a signature without revealing it
2. **Adaptor point:** Public commitment `T = k·G` to secret scalar `k`
3. **Signature extraction:** After final signature is published, extract `k` off-chain

**Key Property:** Publishing a valid signature **reveals** the adaptor secret `k` to anyone who has the pre-signature.

### 2.2 How Adaptor Signatures Work (Schnorr)

**Setup:**
```
1. Generate random scalar k ∈ [1, n-1]
2. Compute adaptor point T = k·G
3. Publish T (commitment to k)
```

**Pre-signature creation:**
```
1. Generate nonce r, compute R = r·G
2. Compute adapted nonce R' = R + T
3. Compute challenge e = H(R' || P || m) where P is public key, m is message
4. Compute pre-signature scalar s' = r + e·x + k (where x is private key)
5. Pre-signature: (R', s')
```

**Final signature (on-chain):**
```
1. Signer computes standard Schnorr signature (R, s) for message m
2. Signature is valid: s = r + e·x (standard Schnorr)
3. Broadcast signature (R, s)
```

**Adaptor extraction (off-chain):**
```
1. Observer has pre-signature (R', s') and final signature (R, s)
2. Compute k = s' - s
3. Verify: k·G == T (adaptor commitment)
```

**Security:** Extracting `k` without the final signature requires solving discrete logarithm problem.

### 2.3 Why This Solves Our Problem

**Sender (Seal):**
1. Generate adaptor secret `k` and commitment `T = k·G`
2. Encrypt master key with `HKDF(k, ...)`
3. Create adaptor pre-signature for Challenge UTXO spend
4. **Erase `k` from memory** (sender cannot decrypt)
5. Publish vault with `T` and pre-signature

**Recipient (Unseal):**
1. Sign Challenge UTXO spend (standard Taproot signature)
2. Broadcast signature (on-chain)
3. **Extract `k`** from pre-signature and final signature (off-chain)
4. Derive decryption key from `k`
5. Decrypt vault

**Cryptographic Enforcement:**
- Without Challenge spend signature, `k` remains hidden (DLP hardness)
- Without `k`, decryption key cannot be derived (HKDF preimage resistance)
- Sender cannot decrypt (erased `k`)
- Only recipient can produce valid signature (private key required)

---

## 3. Binding to PoA Transaction

### 3.1 The Merkle Root Binding

**Problem:** Adaptor signature alone doesn't bind to PoA transaction. Recipient could decrypt without creating PoA.

**Solution:** Incorporate PoA block's **merkle root** into final decryption key derivation.

**Mechanism:**
```
K_final = HKDF(
    ikm = k,  // Adaptor secret (from Challenge spend)
    salt = merkleRoot || outputCommitment,  // PoA block binding
    info = vaultId || "LOCK-v1-UNSEAL",
    len = 32
)
```

**Why merkle root?**
- Merkle root is **unique per block** (cryptographic hash of all transactions)
- Cannot be known until block is mined (proof-of-work required)
- Cannot be forged without mining a valid block (PoW hardness)
- Binds decryption to specific block containing PoA transaction

**Security:**
- Without PoA transaction in a mined block, merkle root is unknowable
- Without merkle root, `K_final` cannot be derived (HKDF preimage resistance)
- Recipient must create PoA transaction and wait for mining

### 3.2 Output Commitment

**Problem:** Recipient could create PoA transaction with wrong amount or address.

**Solution:** Cryptographically bind vault to specific PoA output.

**Mechanism:**
```
outputCommitment = SHA256_tagged(
    tag = "LOCK/outputCommitment",
    data = scriptPubKey || BE64(amount) || network_byte
)
```

**Validation:**
```
1. Fetch PoA transaction from blockchain
2. Find output matching (recipientAddress, poaAmountSats)
3. Compute outputCommitment from output
4. Compare with vault.outputCommitment
5. Reject if mismatch
```

**Security:**
- Output commitment is included in HKDF salt (binds to decryption key)
- Tampering with `outputCommitment` in vault → AEAD decryption fails
- Recipient cannot substitute different PoA output

---

## 4. Key Derivation Hierarchy

### 4.1 Temporary Encryption (Seal)

**Purpose:** Encrypt master key during seal (before PoA exists)

**Derivation:**
```
tempKey = HKDF(
    ikm = k,  // Adaptor secret
    salt = vaultId,
    info = "LOCK-v1-TEMP" || network_byte,
    len = 32
)
```

**Usage:**
```
encMasterKey = AES256GCM_encrypt(
    key = tempKey,
    nonce = random(12 bytes),
    plaintext = masterKey,
    aad = vaultId || T_xonly
)
```

**Note:** This is a **temporary** encryption. The master key is re-encrypted during unseal with `K_final` (which includes merkle root).

**Wait, why temporary?** In the current design, we don't re-encrypt. Let me correct this:

### 4.1 Corrected: Single-Stage Encryption

**Actually, the design uses a single encryption stage:**

```
K_final = HKDF(
    ikm = k,
    salt = merkleRoot || outputCommitment,
    info = vaultId || "LOCK-v1-UNSEAL",
    len = 32
)

encMasterKey = AES256GCM_encrypt(
    key = K_final,
    nonce = random(12 bytes),
    plaintext = masterKey,
    aad = vaultId || T_xonly
)
```

**Problem:** Sender doesn't know `merkleRoot` at seal time!

**Solution:** Use a **two-stage approach**:

1. **Seal:** Encrypt with `tempKey = HKDF(k, vaultId, "LOCK-v1-TEMP")`
2. **Unseal:** Decrypt with `tempKey`, then re-derive `K_final` and verify

**Actually, let me reconsider the design...**

### 4.2 Simplified Single-Stage Design

**Better approach:** Don't include merkle root in encryption key. Use it only for **validation**.

**Seal:**
```
encKey = HKDF(
    ikm = k,
    salt = vaultId || outputCommitment,
    info = "LOCK-v1-SEAL",
    len = 32
)

encMasterKey = AES256GCM_encrypt(
    key = encKey,
    nonce = random(12 bytes),
    plaintext = masterKey,
    aad = vaultId || outputCommitment
)
```

**Unseal:**
```
1. Validate PoA transaction (output matches outputCommitment)
2. Validate PoA confirmations
3. Extract k from Challenge spend
4. Derive encKey = HKDF(k, vaultId || outputCommitment, "LOCK-v1-SEAL")
5. Decrypt masterKey
6. Decrypt payload
```

**Binding to PoA:** The `outputCommitment` in HKDF salt binds to PoA output. Validation ensures PoA exists.

**Problem:** This is application-level validation, not cryptographic enforcement!

### 4.3 Final Design: Merkle Root in AAD

**Compromise:** Include merkle root in AEAD **Additional Authenticated Data (AAD)**, not in key derivation.

**Seal:**
```
encKey = HKDF(k, vaultId, "LOCK-v1-SEAL")
encMasterKey = AES256GCM_encrypt(
    key = encKey,
    plaintext = masterKey,
    aad = vaultId || outputCommitment || PLACEHOLDER_MERKLE_ROOT
)
```

**Problem:** Sender doesn't know merkle root!

**Conclusion:** **Cryptographic binding to merkle root is impossible at seal time.**

---

## 5. The Fundamental Limitation

### 5.1 Cryptographic vs. Application-Level Enforcement

**Cryptographic enforcement:** Decryption is mathematically impossible without specific data.

**Application-level enforcement:** Decryption is possible, but software checks conditions first.

**LOCK v1.0 Reality:**
- **Cryptographically enforced:** Decryption requires `k` (from Challenge spend signature)
- **Application-level enforced:** PoA transaction validation (software checks, not cryptographic)

**Why?**
- Merkle root doesn't exist until block is mined (after seal)
- Cannot include future data in encryption key derivation
- Best we can do: Validate PoA before allowing decryption

### 5.2 Honest Design

**LOCK v1.0 provides:**
1. ✅ **Cryptographic binding to Challenge spend:** Only recipient's private key can extract `k`
2. ✅ **Cryptographic binding to PoA output:** `outputCommitment` in HKDF prevents output substitution
3. ⚠️ **Application-level binding to PoA existence:** Software validates PoA before decryption

**This is still valuable:**
- Sender cannot decrypt (forward secrecy)
- Recipient must prove ownership (Challenge spend)
- PoA validation is deterministic and verifiable
- On-chain privacy (standard Taproot transactions)

---

## 6. Correct Key Derivation Design

### 6.1 Final Design

**Seal:**
```
k = random_scalar()
T = k·G

encKey = HKDF(
    ikm = k,
    salt = vaultId || outputCommitment,
    info = "LOCK-v1-SEAL" || network_byte,
    len = 32
)

encMasterKey = AES256GCM_encrypt(
    key = encKey,
    nonce = random(12 bytes),
    plaintext = masterKey,
    aad = vaultId || T_xonly
)
```

**Unseal:**
```
1. Validate PoA transaction:
   - Fetch PoA tx from blockchain
   - Verify output matches (recipientAddress, poaAmountSats)
   - Compute outputCommitment' from output
   - Assert outputCommitment' == vault.outputCommitment
   - Verify confirmations >= poaMinConfs
   - If poaTimeLock set, verify block.timestamp >= poaTimeLock

2. Spend Challenge UTXO:
   - Sign Challenge spend PSBT
   - Broadcast and confirm

3. Extract adaptor secret:
   - k = pre_sig_s - final_sig_s
   - Verify k·G == T

4. Derive decryption key:
   - encKey = HKDF(k, vaultId || outputCommitment, "LOCK-v1-SEAL" || network_byte)

5. Decrypt:
   - masterKey = AES256GCM_decrypt(encMasterKey, encKey, aad = vaultId || T_xonly)
   - payload = AES256GCM_decrypt(encPayload, masterKey, aad = vaultId || outputCommitment)
```

**Security:**
- `k` is cryptographically bound to Challenge spend (adaptor signature)
- `outputCommitment` is cryptographically bound to PoA output (HKDF salt + AEAD AAD)
- PoA existence is validated before decryption (application-level)

---

## 7. Security Proofs (Informal)

### 7.1 Theorem: Sender Cannot Decrypt

**Claim:** After seal, sender cannot decrypt vault.

**Proof:**
1. Sender erases `k` and `masterKey` from memory after seal
2. To decrypt, sender needs `encKey = HKDF(k, ...)`
3. To derive `encKey`, sender needs `k`
4. To recover `k`, sender needs final Challenge spend signature
5. Only recipient can produce valid signature (private key required)
6. Therefore, sender cannot decrypt. ∎

### 7.2 Theorem: Attacker Cannot Decrypt Without Private Key

**Claim:** Without recipient's private key, attacker cannot decrypt vault.

**Proof:**
1. To decrypt, attacker needs `encKey = HKDF(k, ...)`
2. To derive `encKey`, attacker needs `k`
3. `k` is hidden by adaptor commitment `T = k·G`
4. To extract `k`, attacker needs final Challenge spend signature
5. To produce valid signature, attacker needs recipient's private key (Schnorr unforgeability)
6. Therefore, attacker cannot decrypt without private key. ∎

### 7.3 Theorem: Output Commitment Prevents Substitution

**Claim:** Recipient cannot substitute different PoA output.

**Proof:**
1. `outputCommitment` is included in HKDF salt: `encKey = HKDF(k, vaultId || outputCommitment, ...)`
2. Changing PoA output changes `outputCommitment'`
3. Deriving `encKey' = HKDF(k, vaultId || outputCommitment', ...)` produces different key
4. Decrypting with wrong key fails AEAD tag verification
5. Therefore, recipient cannot substitute PoA output. ∎

---

## 8. Comparison to Alternatives

### 8.1 vs. Traditional Public Key Encryption

| Property | LOCK v1.0 | Traditional PKE |
|----------|-----------|-----------------|
| Sender needs | Recipient address | Recipient public key |
| Decryption requires | Private key + on-chain proof | Private key only |
| Forward secrecy | Yes (sender erases k) | No (sender can decrypt) |
| On-chain binding | Yes (PoA validation) | No |
| Privacy | High (standard Taproot) | N/A (off-chain) |

### 8.2 vs. Witness Encryption

| Property | LOCK v1.0 | Witness Encryption |
|----------|-----------|---------------------|
| Theoretical | Practical | Theoretical only |
| Efficiency | Fast (standard crypto) | Slow (heavy math) |
| Assumptions | DLP, Schnorr, SHA-256 | Indistinguishability obfuscation |
| Implementation | Exists | No practical implementation |

### 8.3 vs. Timelock Encryption

| Property | LOCK v1.0 | Timelock Encryption |
|----------|-----------|---------------------|
| Unlock condition | PoA transaction | Time elapsed |
| Trusted setup | No | Yes (timelock service) |
| Precision | Block-level | Second-level |
| Revocability | No | Depends on scheme |

---

## 9. Open Problems and Future Work

### 9.1 True Cryptographic PoA Binding

**Problem:** PoA validation is application-level, not cryptographic.

**Potential solutions:**
- **Verifiable Delay Functions (VDFs):** Bind to proof-of-work directly
- **Witness encryption:** Encrypt to "PoA transaction exists" statement (theoretical)
- **Covenant scripts:** Use OP_CTV or OP_VAULT when activated (loses privacy)

### 9.2 Post-Quantum Security

**Problem:** Shor's algorithm breaks secp256k1 and Schnorr signatures.

**Potential solutions:**
- Replace secp256k1 with post-quantum signature scheme (Dilithium, Falcon)
- Replace ECDH with post-quantum key exchange (Kyber)
- Adaptor signatures for post-quantum schemes (active research area)

### 9.3 Multi-Recipient Vaults

**Problem:** Current design supports only one recipient.

**Potential solutions:**
- **Threshold:** Use MuSig2 or FROST for M-of-N Challenge spend
- **Independent:** Create separate Challenge UTXOs per recipient
- **Broadcast:** Encrypt to multiple public keys (loses address-only property)

---

**End of Cryptographic Deep Dive**

