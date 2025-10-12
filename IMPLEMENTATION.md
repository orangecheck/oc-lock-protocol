---
title: LOCK Protocol v2.0 - Implementation Plan
date: 2025-10-12
---

# LOCK Protocol v2.0 Implementation Plan

## Overview

This document outlines the complete refactoring needed to implement LOCK Protocol v2.0 with cryptographic output commitment enforcement.

---

## Critical Changes

### 1. Key Derivation (BREAKING CHANGE)

**OLD (WRONG):**
```typescript
// Used SEAL hash in key derivation
const sealHash = await sha256(sealBytes);
const metadataKey = await deriveMetadataKey(sharedSecret, sealHash);
const sealKey = await deriveSealKey(sharedSecret, sealHash);
```

**NEW (CORRECT):**
```typescript
// Use merkle root + output commitment
const key = await hkdf(
  sharedSecret,
  merkleRoot || outputCommitment,  // ← Both required!
  vaultId || 'LOCK-v2',
  32
);
```

### 2. Output Commitment (NEW)

**Add output commitment computation:**
```typescript
// Compute from address + amount
const outputScript = createOutputScript(recipientAddress);
const outputCommitment = SHA256(outputScript || uint64LE(amount));
```

**Store in vault:**
```typescript
interface Vault {
  // ... existing fields
  outputCommitment: Uint8Array;  // ← NEW!
  rules: PoARequirements;         // ← PLAINTEXT (not encrypted)!
}
```

### 3. Rules Storage (BREAKING CHANGE)

**OLD (WRONG):**
```typescript
// Rules were encrypted
encryptedRules: Uint8Array;
rulesNonce: Uint8Array;
rulesTag: Uint8Array;
```

**NEW (CORRECT):**
```typescript
// Rules are PLAINTEXT
rules: {
  recipientAddress: string;
  amount: number;
  confirmations: number;
  timeLock?: number;
}
```

### 4. Vault Structure (BREAKING CHANGE)

**Remove:**
- `bindingTxid` - No binding transaction in v2.0
- `encryptedRules` - Rules are plaintext now
- `rulesNonce` - Not needed
- `rulesTag` - Not needed

**Add:**
- `outputCommitment` - 32-byte hash
- `rules` - Plaintext JSON

### 5. Seal Operation (BREAKING CHANGE)

**OLD:**
```typescript
async function seal(payload, recipientPubkey, rules) {
  // 1. Encrypt payload with base key
  // 2. Encrypt rules with rules key
  // 3. Return vault with encrypted rules
}
```

**NEW:**
```typescript
async function seal(payload, recipientPubkey, rules) {
  // 1. Compute output commitment
  const outputCommitment = await computeOutputCommitment({
    address: rules.recipientAddress,
    amount: rules.amount
  });
  
  // 2. Encrypt payload (recipient will need merkleRoot + outputCommitment to decrypt)
  const baseKey = await hkdf(sharedSecret, 'LOCK-BASE-v2', vaultId, 32);
  const { ciphertext, nonce, tag } = await encryptAesGcm(payload, baseKey);
  
  // 3. Return vault with PLAINTEXT rules
  return {
    ciphertext, nonce, tag,
    creatorPubkey,
    outputCommitment,  // ← NEW!
    rules,             // ← PLAINTEXT!
    vaultId
  };
}
```

### 6. Unseal Operation (BREAKING CHANGE)

**OLD:**
```typescript
async function unseal(vault, recipientPriv, poaTxid) {
  // 1. Decrypt rules
  // 2. Validate PoA
  // 3. Decrypt payload with sealHash
}
```

**NEW:**
```typescript
async function unseal(vault, recipientPriv, poaTxid) {
  // 1. Read rules (plaintext)
  const rules = vault.rules;
  
  // 2. Get PoA transaction and block
  const poaTx = await bitcoin.getTransaction(poaTxid);
  const block = await bitcoin.getBlock(poaTx.blockHash);
  
  // 3. Verify PoA output matches rules
  const actualOutput = poaTx.outputs.find(out => out.address === rules.recipientAddress);
  if (!actualOutput || actualOutput.amount !== rules.amount) {
    throw new Error('PoA output mismatch');
  }
  
  // 4. Compute output commitment from actual transaction
  const outputCommitment = await computeOutputCommitment({
    address: actualOutput.address,
    amount: actualOutput.amount
  });
  
  // 5. Verify commitment matches vault
  if (!bytesEqual(outputCommitment, vault.outputCommitment)) {
    throw new Error('Output commitment mismatch');
  }
  
  // 6. Derive key with merkleRoot + outputCommitment
  const sharedSecret = computeEcdhSecret(recipientPriv, vault.creatorPubkey);
  const key = await hkdf(
    sharedSecret,
    block.merkleRoot || outputCommitment,  // ← Both required!
    vault.vaultId || 'LOCK-v2',
    32
  );
  
  // 7. Decrypt payload
  return await decryptAesGcm({ ciphertext, nonce, tag, key });
}
```

---

## Files to Create

### 1. `src/modules/lock/lib/lock/outputCommitment.ts`

New file for output commitment computation:
- `computeOutputCommitment(address, amount)` - Compute commitment
- `createOutputScript(address)` - Create Bitcoin output script
- `encodeAmountLE(amount)` - Encode amount as little-endian uint64
- `verifyOutputCommitment(commitment, params)` - Verify commitment

### 2. `src/modules/lock/lib/lock/merkleRoot.ts`

New file for merkle root extraction:
- `extractMerkleRoot(blockHash)` - Get merkle root from block
- `getMerkleRootFromPoA(poaTxid)` - Get merkle root from PoA transaction's block

---

## Files to Modify

### 1. `src/modules/lock/lib/lock/crypto.ts`

**Changes:**
- Remove `deriveMetadataKey()` - Not needed in v2.0
- Remove `deriveSealKey()` - Not needed in v2.0
- Update `hkdf()` to support concatenated salt (merkleRoot || outputCommitment)

### 2. `src/modules/lock/lib/lock/keyDerivation.ts`

**Changes:**
- Remove `deriveVaultKeys()` - Old approach
- Add `deriveDecryptionKey(sharedSecret, merkleRoot, outputCommitment, vaultId)` - New approach
- Update all key derivation to use merkleRoot + outputCommitment

### 3. `src/modules/lock/lib/lock/types.ts`

**Changes:**
- Add `outputCommitment: Uint8Array` to Vault interface
- Change `encryptedRules` to `rules: PoARequirements` (plaintext)
- Remove `bindingTxid` field
- Update `PoARequirements` interface

### 4. `src/modules/lock/lib/lock/seal.ts`

**Changes:**
- Update `createSeal()` to compute output commitment
- Update `createSeal()` to store plaintext rules
- Remove rules encryption logic

### 5. `src/modules/lock/lib/lock/vault.ts`

**Changes:**
- Update vault creation to include output commitment
- Update vault creation to store plaintext rules
- Remove binding transaction logic

### 6. `src/modules/lock/lib/lock/poa.ts`

**Changes:**
- Add output commitment verification
- Update validation to check actual transaction output
- Add merkle root requirement

### 7. `src/modules/lock/lib/lock/serialization.ts`

**Changes:**
- Update binary format to include outputCommitment field
- Update binary format to include plaintext rules section
- Remove encrypted rules fields

### 8. `src/modules/lock/lib/lock/vaultSerialization.ts`

**Changes:**
- Update vault serialization format
- Add outputCommitment field
- Change rules to plaintext JSON
- Remove binding transaction fields

### 9. `src/modules/lock/schemas/*.ts`

**Changes:**
- Update Zod schemas to match new vault structure
- Add outputCommitment validation
- Update rules schema (no longer encrypted)
- Remove binding transaction schemas

---

## Implementation Order

1. ✅ Create protocol documentation (DONE)
2. ⏳ Create `outputCommitment.ts` - Core new functionality
3. ⏳ Create `merkleRoot.ts` - Bitcoin integration
4. ⏳ Update `crypto.ts` - Remove old key derivation
5. ⏳ Update `keyDerivation.ts` - New key derivation with output commitment
6. ⏳ Update `types.ts` - New vault structure
7. ⏳ Update `seal.ts` - New seal operation
8. ⏳ Update `poa.ts` - Output commitment verification
9. ⏳ Update `serialization.ts` - New binary format
10. ⏳ Update `vaultSerialization.ts` - New vault format
11. ⏳ Update schemas - Match new structure
12. ⏳ Implement LOCKCHAT - Complete messaging UX

---

## Testing Strategy

### Unit Tests

1. **Output Commitment**
   - Test commitment computation
   - Test with different address types (P2WPKH, P2PKH)
   - Test with different amounts
   - Test verification

2. **Key Derivation**
   - Test with merkleRoot + outputCommitment
   - Test that wrong commitment produces wrong key
   - Test that wrong merkleRoot produces wrong key

3. **Seal/Unseal**
   - Test complete seal/unseal flow
   - Test that wrong output fails decryption
   - Test that wrong amount fails decryption

### Integration Tests

1. **Complete Flow**
   - Create vault with specific output requirement
   - Create PoA transaction with correct output
   - Verify decryption succeeds
   - Create PoA with wrong output
   - Verify decryption fails

2. **LOCKCHAT**
   - Send message with output requirement
   - Receive and decrypt message
   - Verify conversation threading
   - Test with demo mode

---

## Migration Notes

**This is a BREAKING CHANGE.**

Vaults created with the old protocol CANNOT be decrypted with the new protocol.

Users will need to:
1. Decrypt old vaults with old code
2. Re-encrypt with new protocol
3. Delete old vaults

**No automatic migration is possible** because the key derivation is fundamentally different.

---

## Next Steps

1. Implement core output commitment functionality
2. Update key derivation
3. Refactor seal/unseal operations
4. Update PoA validation
5. Update serialization
6. Implement LOCKCHAT with correct protocol
7. Write comprehensive tests
8. Update UI/UX to reflect new protocol

---

## Questions for User

1. Should we maintain backward compatibility with old vaults, or clean break?
2. Should we add a migration tool to help users re-encrypt old vaults?
3. What should happen to existing vaults in the database?

---

## License

CC-BY-4.0

