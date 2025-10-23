# LOCK Protocol v1.0 — Implementation Analysis & Refactoring Plan

**Date:** 2025-10-16  
**Status:** Analysis Complete - Ready for Implementation

---

## 1. Current Implementation Assessment

### 1.1 What Exists

**Current Protocol (BROKEN - Challenge-Based Encryption):**
- ✅ Basic crypto primitives (HKDF, AES-GCM, SHA-256, secp256k1 ECDSA)
- ✅ Vault serialization/deserialization
- ✅ Blockchain API integration (Blockstream.info)
- ✅ PoA transaction validation
- ✅ Comprehensive test suite
- ❌ **NOT cryptographically enforced** (application-level validation only)

**Current Seal Process:**
```typescript
1. Generate vaultId, challenge, outputCommitment
2. Generate random masterKey
3. Encrypt payload with masterKey
4. Derive baseKey = HKDF(challenge, ...) // ← WRONG: challenge is public!
5. Encrypt masterKey with baseKey
6. Return vault
```

**Current Unseal Process:**
```typescript
1. Validate PoA transaction (confirmations, output, timelock)
2. Sign challenge (for validation only)
3. Derive unsealKey = HKDF(challenge, ...) // ← SAME KEY AS SEAL!
4. Decrypt masterKey
5. Decrypt payload
```

**Critical Flaw:** Anyone with the vault file can decrypt it because the encryption key is derived from the public challenge. The signature is used for validation only, not key derivation.

### 1.2 What's Missing for Taproot Adaptor Protocol

**Required New Components:**
1. **Schnorr Signatures (BIP-340)** - Replace ECDSA with Schnorr
2. **Adaptor Signature Construction** - Create pre-signatures with adaptor point
3. **Adaptor Secret Extraction** - Extract `k` from final signature
4. **Challenge UTXO Creation** - Fund P2TR output on-chain
5. **PSBT Construction** - Build PSBTs for Challenge spend
6. **Taproot Address Support** - P2TR address encoding/decoding
7. **Ephemeral Keypair Generation** - Generate temporary keys for adaptor
8. **Wallet Integration** - Sign PSBTs with browser/hardware wallets

---

## 2. Dependency Analysis

### 2.1 Current Dependencies

```json
{
  "@noble/secp256k1": "^3.0.0",      // ✅ Has Schnorr support
  "bitcoinjs-lib": "^7.0.0",          // ✅ Has Taproot/PSBT support
  "@scure/btc-signer": "^2.0.1",     // ✅ Alternative PSBT library
  "bip322-js": "^3.0.0",              // ✅ BIP-322 message signing
  "tiny-secp256k1": "^2.2.4"          // ✅ Low-level secp256k1
}
```

### 2.2 Capability Assessment

**@noble/secp256k1 v3:**
- ✅ Schnorr signatures (BIP-340)
- ✅ Point multiplication and scalar arithmetic
- ❌ **No built-in adaptor signature support** (must implement manually)

**bitcoinjs-lib v7:**
- ✅ Taproot address encoding (Bech32m)
- ✅ P2TR output creation
- ✅ PSBT construction and signing (BIP-174, BIP-371)
- ✅ Taproot key-path spending

**@scure/btc-signer:**
- ✅ Modern PSBT library
- ✅ Taproot support
- ✅ Better TypeScript types

### 2.3 What We Need to Implement

**Adaptor Signature Math (Custom Implementation Required):**
```typescript
// No existing library provides this - we must implement:
1. generateAdaptorSecret() → (k, T)
2. createPreSignature(message, privKey, T) → (R', s')
3. extractAdaptorSecret(preSig, finalSig) → k
4. verifyAdaptorCommitment(k, T) → boolean
```

---

## 3. Implementation Complexity Assessment

### 3.1 Complexity Levels

**Level 1: Straightforward (Existing Libraries)**
- Schnorr signature generation/verification ✅
- Taproot address encoding ✅
- PSBT construction ✅
- P2TR output creation ✅

**Level 2: Moderate (Custom Implementation)**
- Adaptor signature pre-signature creation ⚠️
- Adaptor secret extraction ⚠️
- Challenge UTXO funding workflow ⚠️

**Level 3: Complex (Novel Integration)**
- Wallet integration for Challenge spend ⚠️
- Air-gapped PSBT workflow ⚠️
- Reorg handling with merkle root rebinding ⚠️

### 3.2 Risk Assessment

**High Risk:**
- ❌ **Adaptor signature math** - No existing library; must implement from scratch
- ❌ **Wallet compatibility** - Browser wallets may not support required signing modes
- ❌ **On-chain costs** - Challenge UTXO funding costs real bitcoin

**Medium Risk:**
- ⚠️ **PSBT complexity** - Taproot PSBTs are more complex than legacy
- ⚠️ **Testing** - Requires testnet bitcoin for integration tests
- ⚠️ **UX complexity** - Multi-step flow (fund Challenge → create PoA → spend Challenge)

**Low Risk:**
- ✅ **Crypto primitives** - Well-tested libraries
- ✅ **Blockchain API** - Existing integration works

---

## 4. Critical Blocker: Adaptor Signatures

### 4.1 The Problem

**Adaptor signatures are NOT a standard primitive.** They require:

1. **Pre-signature creation:**
   ```
   R' = R + T  (where T = k·G)
   s' = r + e·x + k  (modified Schnorr signature)
   ```

2. **Extraction:**
   ```
   k = s' - s  (where s is final signature scalar)
   ```

3. **Verification:**
   ```
   k·G == T  (verify extracted secret matches commitment)
   ```

### 4.2 Implementation Options

**Option A: Implement Adaptor Math Manually**
- ✅ Full control over implementation
- ✅ Can optimize for our use case
- ❌ High complexity (cryptographic math)
- ❌ Security risk (easy to make mistakes)
- ❌ Requires extensive testing

**Option B: Use Existing Adaptor Library**
- ✅ Battle-tested implementation
- ✅ Lower security risk
- ❌ **No JavaScript library exists!**
- ❌ Rust libraries exist but require WASM compilation

**Option C: Simplify Protocol (Remove Adaptor Requirement)**
- ✅ Much simpler implementation
- ✅ Can use standard Schnorr signatures
- ❌ **Loses cryptographic enforcement** (back to application-level)
- ❌ Defeats the purpose of the redesign

### 4.3 Recommendation

**Implement Option A with extreme caution:**
1. Study existing Rust implementations (e.g., `secp256k1-zkp`)
2. Implement adaptor math using `@noble/secp256k1` primitives
3. Create comprehensive test vectors
4. Consider security audit before production use

---

## 5. Simplified Alternative: Hybrid Approach

### 5.1 Proposal

**Use Schnorr signatures WITHOUT adaptor signatures:**

**Seal:**
```typescript
1. Generate ephemeral keypair (ephemeralPriv, ephemeralPub)
2. Encrypt payload with masterKey
3. Encrypt masterKey with HKDF(ephemeralPriv, ...)
4. Store ephemeralPub in vault
5. Erase ephemeralPriv
```

**Unseal:**
```typescript
1. Validate PoA transaction
2. Sign challenge with recipient's private key (Schnorr)
3. Recover public key from signature (if possible)
4. Derive shared secret via ECDH(ephemeralPub, recipientPrivKey)
5. Derive decryption key from shared secret
6. Decrypt masterKey and payload
```

**Problem:** Schnorr signatures don't support public key recovery like ECDSA!

### 5.2 Alternative: Use ECDH Directly

**Seal:**
```typescript
1. Recipient provides public key (not just address)
2. Generate ephemeral keypair
3. Derive shared secret = ECDH(ephemeralPriv, recipientPub)
4. Encrypt with shared secret
```

**Problem:** Requires recipient's public key, not just address!

---

## 6. Honest Assessment

### 6.1 The Truth

**The Taproot adaptor-locked secret protocol as specified is:**
- ✅ Cryptographically sound (in theory)
- ✅ Privacy-preserving (on-chain indistinguishability)
- ✅ Innovative (novel use of adaptor signatures)
- ❌ **Extremely complex to implement** (no existing libraries)
- ❌ **High security risk** (custom crypto implementation)
- ❌ **Expensive** (requires on-chain Challenge UTXO funding)
- ❌ **Poor UX** (multi-step flow with blockchain interactions)

### 6.2 Recommendation

**For a production application, I recommend:**

**Option 1: Simplified Protocol (Practical)**
- Use standard Schnorr signatures for PoA validation
- Encrypt to recipient's public key (require public key, not just address)
- Use ECDH for key derivation
- Application-level PoA validation (honest but not cryptographically enforced)
- **Pros:** Simple, secure, testable, good UX
- **Cons:** Not cryptographically enforced (but still very secure)

**Option 2: Full Adaptor Protocol (Research)**
- Implement full adaptor signature protocol
- Extensive testing and security audit
- Consider this a research project, not production-ready
- **Pros:** Achieves cryptographic enforcement
- **Cons:** High complexity, security risk, poor UX, expensive

---

## 7. Implementation Plan (Option 1: Simplified)

### 7.1 Phase 1: Core Crypto (1-2 days)

1. **Add Schnorr signature support:**
   - Use `@noble/secp256k1` Schnorr functions
   - Replace ECDSA with Schnorr throughout

2. **Add ECDH support:**
   - Implement shared secret derivation
   - Use for key derivation instead of challenge

3. **Update vault structure:**
   - Add `recipientPubKey` field (33 bytes, compressed)
   - Add `ephemeralPub` field (33 bytes, compressed)
   - Remove `challenge` field (no longer needed)

### 7.2 Phase 2: Seal/Unseal (2-3 days)

1. **Refactor seal:**
   - Generate ephemeral keypair
   - Derive shared secret = ECDH(ephemeralPriv, recipientPub)
   - Derive encryption key from shared secret
   - Encrypt masterKey and payload
   - Store ephemeralPub in vault

2. **Refactor unseal:**
   - Validate PoA transaction
   - Sign challenge with Schnorr (for PoA validation)
   - Derive shared secret = ECDH(recipientPriv, ephemeralPub)
   - Derive decryption key from shared secret
   - Decrypt masterKey and payload

### 7.3 Phase 3: Testing (2-3 days)

1. **Unit tests:**
   - Schnorr signature generation/verification
   - ECDH shared secret derivation
   - Seal/unseal round-trip

2. **Integration tests:**
   - Full seal/unseal with PoA validation
   - Testnet integration

3. **Security tests:**
   - Wrong private key cannot decrypt
   - Tampered vault fails decryption
   - PoA validation enforced

### 7.4 Phase 4: UI Integration (3-5 days)

1. **Update seal flow:**
   - Request recipient's public key (not just address)
   - Show ephemeral keypair generation
   - Display vault file

2. **Update unseal flow:**
   - Import vault
   - Create PoA transaction
   - Sign challenge (Schnorr)
   - Decrypt payload

---

## 8. Decision Required

**User must decide:**

**A) Implement Simplified Protocol (Recommended)**
- Faster implementation (1-2 weeks)
- Lower security risk
- Better UX
- Application-level PoA enforcement (still very secure)

**B) Implement Full Adaptor Protocol (Research Project)**
- Longer implementation (4-8 weeks)
- Higher security risk (custom crypto)
- Complex UX
- True cryptographic enforcement
- Requires security audit

**C) Hybrid Approach**
- Implement simplified protocol now
- Research adaptor signatures separately
- Migrate to full protocol later (breaking change)

---

## 9. Next Steps

**If Option A (Simplified) is chosen:**
1. ✅ Update protocol specification to reflect simplified design
2. ✅ Implement Schnorr + ECDH crypto primitives
3. ✅ Refactor seal/unseal functions
4. ✅ Update tests
5. ✅ Update UI components
6. ✅ Deploy to testnet

**If Option B (Full Adaptor) is chosen:**
1. ⚠️ Research adaptor signature implementations (Rust, C++)
2. ⚠️ Implement adaptor math in TypeScript
3. ⚠️ Create comprehensive test vectors
4. ⚠️ Security audit (external)
5. ⚠️ Implement Challenge UTXO funding
6. ⚠️ Implement PSBT construction/signing
7. ⚠️ Update UI for multi-step flow
8. ⚠️ Deploy to testnet with real bitcoin

---

**End of Analysis**

