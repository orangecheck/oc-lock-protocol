# LOCK Protocol v1.0 - Technical Specification

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2025-10-12

## Table of Contents

1. [Binary Format](#1-binary-format)
2. [Algorithms](#2-algorithms)
3. [Test Vectors](#3-test-vectors)
4. [Security Analysis](#4-security-analysis)
5. [Implementation Guidelines](#5-implementation-guidelines)

---

## 1. Binary Format

### 1.1 Vault File Format (.vault)

LOCK vaults are serialized as binary files with the `.vault` extension.

**File Structure:**

```
+------------------+------------------+--------------------------------+
| Field            | Size (bytes)     | Description                    |
+------------------+------------------+--------------------------------+
| Magic            | 4                | 0x4C4F434B ("LOCK")            |
| Version          | 1                | Protocol version (0x01)        |
| VaultID          | 32               | Unique vault identifier        |
| Challenge        | 32               | Challenge hash                 |
| OutputCommitment | 32               | Output commitment hash         |
| RulesLength      | 2                | Length of rules JSON (uint16)  |
| Rules            | Variable         | PoA requirements (JSON)        |
| EncMasterKeyLen  | 2                | Encrypted master key length    |
| EncMasterKey     | Variable         | Encrypted master key           |
| MasterKeyNonce   | 12               | Master key AES-GCM nonce       |
| MasterKeyTag     | 16               | Master key AES-GCM tag         |
| CiphertextLen    | 4                | Payload ciphertext length      |
| Ciphertext       | Variable         | Encrypted payload              |
| PayloadNonce     | 12               | Payload AES-GCM nonce          |
| PayloadTag       | 16               | Payload AES-GCM tag            |
+------------------+------------------+--------------------------------+
```

**Total Fixed Overhead:** 163 bytes + rules JSON length

### 1.2 Encoding Rules

**Integers:**
- uint16: Little-endian, 2 bytes
- uint32: Little-endian, 4 bytes
- uint64: Little-endian, 8 bytes

**Byte Arrays:**
- Raw bytes, no encoding

**Strings (Rules JSON):**
- UTF-8 encoded
- Length-prefixed (uint16)

### 1.3 Rules JSON Format

```json
{
  "recipientAddress": "bc1q...",
  "amount": 100000,
  "confirmations": 1,
  "timeLock": 850000
}
```

**Field Constraints:**
- `recipientAddress`: Valid Bitcoin address string
- `amount`: Positive integer, max 2^53-1 (JavaScript safe integer)
- `confirmations`: Positive integer, typically 1-6
- `timeLock`: Optional, positive integer (block height)

---

## 2. Algorithms

### 2.1 Complete Unsealing Algorithm

```
UNSEAL(vault, recipientPriv, poaTxid):

1. Fetch PoA transaction
   poaTx ← blockchain.getTransaction(poaTxid)
   
2. Verify confirmation
   IF NOT poaTx.status.confirmed:
       THROW "PoA transaction not confirmed"

3. Find matching output
   output ← NULL
   FOR EACH o IN poaTx.outputs:
       IF o.address = vault.rules.recipientAddress AND
          o.value = vault.rules.amount:
           output ← o
           BREAK
   IF output = NULL:
       THROW "No matching output found"

4. Verify confirmations
   currentHeight ← blockchain.getBlockHeight()
   confirmations ← currentHeight - poaTx.blockHeight + 1
   IF confirmations < vault.rules.confirmations:
       THROW "Insufficient confirmations"

5. Verify time lock
   IF vault.rules.timeLock EXISTS:
       IF poaTx.blockHeight < vault.rules.timeLock:
           THROW "Time lock not satisfied"

6. Verify output commitment
   outputScript ← bitcoin.address.toOutputScript(output.address, network)
   amountBytes ← encodeUint64LE(output.value)
   actualCommitment ← SHA256(outputScript || amountBytes)
   IF actualCommitment ≠ vault.outputCommitment:
       THROW "Output commitment mismatch"

7. Extract merkle root
   block ← blockchain.getBlock(poaTx.blockHash)
   merkleRoot ← hexToBytes(block.merkle_root)

8. Sign challenge
   signature ← ECDSA-Sign(vault.challenge, recipientPriv)

9. Derive unseal key
   signatureHash ← SHA256(signature)
   unsealKey ← HKDF-SHA256(
       ikm: signatureHash,
       salt: merkleRoot || vault.outputCommitment,
       info: vault.vaultId || 'LOCK-v1-UNSEAL',
       length: 32
   )

10. Decrypt master key
    masterKeyAAD ← vault.vaultId || vault.outputCommitment
    masterKey ← AES-256-GCM-Decrypt(
        ciphertext: vault.encryptedMasterKey,
        key: unsealKey,
        nonce: vault.masterKeyNonce,
        tag: vault.masterKeyTag,
        aad: masterKeyAAD
    )

11. Decrypt payload
    payloadAAD ← vault.vaultId || vault.challenge
    payload ← AES-256-GCM-Decrypt(
        ciphertext: vault.ciphertext,
        key: masterKey,
        nonce: vault.payloadNonce,
        tag: vault.payloadTag,
        aad: payloadAAD
    )

12. RETURN payload
```

### 2.2 Challenge Verification

```
VERIFY_CHALLENGE(vault):
    challengeInput ← concat(
        'LOCK-v1-CHALLENGE',
        vault.vaultId,
        vault.rules.recipientAddress,
        vault.outputCommitment
    )
    expectedChallenge ← SHA256(challengeInput)
    RETURN expectedChallenge = vault.challenge
```

### 2.3 Output Commitment Computation

```
COMPUTE_OUTPUT_COMMITMENT(address, amount, network):
    outputScript ← bitcoin.address.toOutputScript(address, network)
    amountBytes ← encodeUint64LE(amount)
    commitment ← SHA256(outputScript || amountBytes)
    RETURN commitment
```

---

## 3. Test Vectors

### 3.1 Test Vector 1: Basic Seal/Unseal

**Inputs:**
```
payload: "Hello, LOCK Protocol!"
recipientAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
amount: 100000 satoshis
confirmations: 1
network: mainnet
```

**Expected Vault Fields:**
```
version: 0x01
vaultId: (32 random bytes)
challenge: SHA256('LOCK-v1-CHALLENGE' || vaultId || address || outputCommitment)
outputCommitment: SHA256(outputScript || amountBytes)
```

**Output Script for bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4:**
```
0x0014751e76e8199196d454941c45d1b3a323f1433bd6
```

**Amount Bytes (100000 satoshis, little-endian uint64):**
```
0xa086010000000000
```

**Output Commitment:**
```
SHA256(0x0014751e76e8199196d454941c45d1b3a323f1433bd6a086010000000000)
= 0x... (32 bytes)
```

### 3.2 Test Vector 2: Challenge Generation

**Inputs:**
```
vaultId: 0x0000000000000000000000000000000000000000000000000000000000000001
recipientAddress: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
outputCommitment: 0x0000000000000000000000000000000000000000000000000000000000000002
```

**Challenge Input:**
```
'LOCK-v1-CHALLENGE' (UTF-8 bytes)
|| 0x0000000000000000000000000000000000000000000000000000000000000001
|| 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' (UTF-8 bytes)
|| 0x0000000000000000000000000000000000000000000000000000000000000002
```

**Expected Challenge:**
```
SHA256(challengeInput) = 0x... (32 bytes)
```

### 3.3 Test Vector 3: HKDF Key Derivation

**Inputs:**
```
ikm: 0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b (22 bytes)
salt: 'LOCK-v1-BASE'
info: 0x0000000000000000000000000000000000000000000000000000000000000001
      || 0x0000000000000000000000000000000000000000000000000000000000000002
length: 32
```

**Expected Output:**
```
HKDF-SHA256(...) = 0x... (32 bytes)
```

### 3.4 Test Vector 4: AES-256-GCM Encryption

**Inputs:**
```
plaintext: "Test payload"
key: 0x0000000000000000000000000000000000000000000000000000000000000000
nonce: 0x000000000000000000000000
aad: 0x0000000000000000000000000000000000000000000000000000000000000001
```

**Expected Output:**
```
ciphertext: 0x... (12 bytes)
tag: 0x... (16 bytes)
```

### 3.5 Test Vector 5: Complete Seal/Unseal Cycle

**Setup:**
```
recipientPriv: 0x0000000000000000000000000000000000000000000000000000000000000001
recipientPub: 0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798
recipientAddress: (derived from recipientPub)
payload: "Complete test"
amount: 50000
```

**Seal:**
1. Generate vault with above parameters
2. Verify challenge is correctly computed
3. Verify output commitment is correct
4. Verify payload is encrypted

**Unseal:**
1. Create mock PoA transaction
2. Sign challenge with recipientPriv
3. Derive unseal key
4. Decrypt master key
5. Decrypt payload
6. Verify payload matches original

**Expected Result:**
```
Decrypted payload = "Complete test"
```

---

## 4. Security Analysis

### 4.1 Threat Model

**Attacker Capabilities:**
- Can observe all vault data (vault is public)
- Can observe blockchain (PoA transaction is public)
- Cannot break: SHA-256, ECDSA, AES-256-GCM, HKDF
- Cannot obtain recipient's private key

**Security Goals:**
- **Confidentiality:** Only recipient can decrypt
- **Integrity:** Tampering is detectable
- **Access Control:** Decryption requires PoA transaction

### 4.2 Attack Scenarios

#### 4.2.1 Decrypt Without PoA

**Attack:** Attempt to decrypt without creating PoA transaction

**Defense:**
- Unseal key requires merkle root
- Merkle root only available after PoA is mined
- Cannot derive unseal key without merkle root

**Result:** Attack fails

#### 4.2.2 Decrypt Without Private Key

**Attack:** Attempt to decrypt without recipient's private key

**Defense:**
- Unseal key requires signature
- Signature requires private key
- Cannot create valid signature without private key

**Result:** Attack fails

#### 4.2.3 PoA to Different Address

**Attack:** Create PoA to different address, attempt to decrypt

**Defense:**
- Different address → different output script
- Different output script → different output commitment
- Different output commitment → different unseal key
- Wrong unseal key → decryption fails

**Result:** Attack fails (garbage output or authentication error)

#### 4.2.4 PoA with Different Amount

**Attack:** Create PoA with different amount, attempt to decrypt

**Defense:**
- Different amount → different output commitment
- Different output commitment → different unseal key
- Wrong unseal key → decryption fails

**Result:** Attack fails

#### 4.2.5 Forge Signature

**Attack:** Forge ECDSA signature for challenge

**Defense:**
- Requires breaking secp256k1 ECDSA
- Computational complexity: ~2^128 operations
- Infeasible with current technology

**Result:** Attack fails

#### 4.2.6 Modify Ciphertext

**Attack:** Modify encrypted data, attempt to decrypt

**Defense:**
- AES-GCM authentication tag
- Tag verification fails if ciphertext modified
- Decryption aborts

**Result:** Attack fails

### 4.3 Security Properties

**Theorem 1 (Confidentiality):**
If SHA-256, ECDSA, AES-256-GCM, and HKDF are secure, then only the recipient (holder of private key) can decrypt the vault after creating a valid PoA.

**Theorem 2 (Integrity):**
If SHA-256 and AES-256-GCM are secure, then any modification to the vault or PoA transaction will be detected during unsealing.

**Theorem 3 (Access Control):**
If the blockchain is secure and merkle roots are unpredictable, then decryption is impossible before a valid PoA transaction is confirmed.

---

## 5. Implementation Guidelines

### 5.1 Cryptographic Library Requirements

**Required:**
- SHA-256 implementation (Web Crypto API or equivalent)
- HKDF-SHA256 (RFC 5869 compliant)
- AES-256-GCM (NIST SP 800-38D compliant)
- ECDSA on secp256k1 (Bitcoin-compatible)
- Bitcoin address encoding/decoding

**Recommended Libraries:**
- **JavaScript/TypeScript:** Web Crypto API, @noble/secp256k1, bitcoinjs-lib
- **Python:** cryptography, ecdsa, python-bitcoinlib
- **Rust:** ring, secp256k1, bitcoin

### 5.2 Security Considerations

**Random Number Generation:**
- MUST use cryptographically secure RNG
- Use `crypto.getRandomValues()` in browsers
- Use `/dev/urandom` or equivalent on servers

**Key Management:**
- Private keys MUST be stored securely
- Consider hardware wallets for high-value vaults
- Implement key derivation (BIP32/BIP44) for multiple addresses

**Blockchain Queries:**
- Use trusted blockchain API providers
- Verify merkle root against multiple sources
- Implement retry logic for network failures

**Error Handling:**
- Do NOT leak information in error messages
- Use constant-time comparisons for sensitive data
- Clear sensitive data from memory after use

### 5.3 Performance Optimization

**Large Payloads:**
- Two-stage encryption allows efficient handling
- Master key encryption is fast (32 bytes)
- Payload encryption is standard AES-GCM

**Batch Operations:**
- Can seal multiple vaults in parallel
- Can verify multiple PoAs concurrently
- Use worker threads for CPU-intensive operations

**Caching:**
- Cache blockchain queries (blocks, transactions)
- Cache address validation results
- Invalidate cache on network changes

### 5.4 Testing Requirements

**Unit Tests:**
- Test each cryptographic primitive independently
- Test all error conditions
- Test edge cases (empty payload, max values, etc.)

**Integration Tests:**
- Test complete seal/unseal cycle
- Test with real blockchain data (testnet)
- Test error recovery

**Security Tests:**
- Fuzz testing on vault parsing
- Test with invalid signatures
- Test with modified ciphertexts
- Test timing attacks (constant-time operations)

### 5.5 Compatibility

**Address Types:**
- MUST support: P2WPKH (bc1q...), P2PKH (1...)
- SHOULD support: P2SH (3...), P2TR (bc1p...)

**Networks:**
- MUST support: Bitcoin mainnet
- SHOULD support: Bitcoin testnet, signet

**Signature Formats:**
- MUST support: DER-encoded ECDSA
- SHOULD support: Compact format (for compatibility)

---

## Appendix A: Constants

```
PROTOCOL_VERSION = 0x01
MAGIC_BYTES = 0x4C4F434B  // "LOCK"
CHALLENGE_PREFIX = 'LOCK-v1-CHALLENGE'
BASE_SALT = 'LOCK-v1-BASE'
UNSEAL_INFO = 'LOCK-v1-UNSEAL'
AES_GCM_NONCE_LENGTH = 12
AES_GCM_TAG_LENGTH = 16
AES_GCM_KEY_LENGTH = 32
SHA256_LENGTH = 32
SECP256K1_PRIVKEY_LENGTH = 32
SECP256K1_PUBKEY_LENGTH = 33  // compressed
```

## Appendix B: Error Codes

```
ERR_INVALID_VAULT = 1001
ERR_POA_NOT_CONFIRMED = 2001
ERR_NO_MATCHING_OUTPUT = 2002
ERR_INSUFFICIENT_CONFIRMATIONS = 2003
ERR_TIMELOCK_NOT_SATISFIED = 2004
ERR_OUTPUT_COMMITMENT_MISMATCH = 2005
ERR_INVALID_SIGNATURE = 3001
ERR_DECRYPTION_FAILED = 3002
ERR_BLOCKCHAIN_ERROR = 4001
```

