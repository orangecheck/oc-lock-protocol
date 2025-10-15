```
  Title: LOCK Protocol Specification
  Version: 1.0
  Status: Draft
  Type: Standards Track
  Created: 2025-10-12
  Authors: OrangeCheck Protocol Contributors
  License: CC-BY-4.0
```

# LOCK Protocol v1.0

**Ledger-Originated Cryptographic Key Protocol**

## Abstract

LOCK Protocol v1.0 is a Bitcoin-enforced encryption protocol that enables secure data encryption to a Bitcoin address without requiring the recipient's public key or transaction history. The protocol uses signature-based key derivation where recipients prove address ownership by signing a cryptographic challenge, combined with merkle root entropy and output commitment enforcement to create cryptographically-enforced proof-of-access requirements.

The protocol solves the fundamental problem of encrypting to Bitcoin addresses (which contain only public key hashes) by leveraging the recipient's ability to sign messages as proof of private key ownership, eliminating the need for public key extraction from blockchain history.

## Copyright

This document is licensed under the Creative Commons Attribution 4.0 International License (CC-BY-4.0).

## Table of Contents

1. [Introduction](#1-introduction)
2. [Motivation](#2-motivation)
3. [Specification](#3-specification)
4. [Rationale](#4-rationale)
5. [Security Analysis](#5-security-analysis)
6. [Backwards Compatibility](#6-backwards-compatibility)
7. [Reference Implementation](#7-reference-implementation)
8. [Test Vectors](#8-test-vectors)
9. [References](#9-references)

---

## 1. Introduction

### 1.1 Overview

LOCK Protocol enables the creation of encrypted "vaults" that can only be decrypted by the holder of a specific Bitcoin address's private key, and only after they create a valid proof-of-access (PoA) transaction on the Bitcoin blockchain.

**Key Properties:**
- **Address-only encryption:** Creator needs only the recipient's Bitcoin address
- **No public key required:** Works with any address, including unused addresses
- **Cryptographic enforcement:** Access requirements enforced by cryptography, not client validation
- **Zero creation cost:** Vault creation is entirely off-chain
- **Privacy-preserving:** PoA is a self-spend transaction (no payment to creator)

### 1.2 Terminology

- **Vault:** An encrypted data container with embedded access requirements
- **Sealing:** The process of encrypting data into a vault
- **Unsealing:** The process of decrypting a vault
- **Proof-of-Access (PoA):** A Bitcoin transaction that proves the recipient meets access requirements
- **Challenge:** A cryptographic value that must be signed to prove address ownership
- **Output Commitment:** A cryptographic binding between the decryption key and a specific transaction output
- **Merkle Root:** The merkle root of the Bitcoin block containing the PoA transaction, used as entropy

---

## 2. Motivation

### 2.1 The Problem

Traditional encryption to Bitcoin addresses faces fundamental challenges:

1. **Public Key Unavailability:** Bitcoin addresses (P2WPKH, P2PKH) contain only a hash of the public key, not the public key itself
2. **ECDH Limitation:** Standard ECDH encryption requires the recipient's actual public key
3. **Transaction History Dependency:** Public keys are only revealed when an address owner spends from it
4. **Unused Address Problem:** New or unused addresses have no public key available on-chain

Existing approaches require either:
- Extracting public keys from blockchain transaction history (fails for unused addresses)
- Out-of-band public key exchange (defeats the purpose of address-based encryption)
- Password-based encryption (not cryptographically sound, no proof of ownership)

### 2.2 The Solution

LOCK Protocol uses **signature-based key derivation** instead of ECDH:

1. Creator generates a cryptographic challenge derived from vault parameters
2. Recipient must sign this challenge with their address's private key
3. The signature serves as proof of address ownership
4. The signature is used (with merkle root and output commitment) to derive the decryption key
5. Only the holder of the address's private key can create a valid signature

**Advantages:**
- Works with ANY Bitcoin address (even unused ones)
- No blockchain queries needed for vault creation
- Cryptographically sound proof of ownership
- Maintains all security properties of traditional encryption

---

## 3. Specification

### 3.1 Cryptographic Primitives

#### 3.1.1 Hash Functions

**SHA-256:** Used for all hashing operations
```
hash = SHA256(data)
```

#### 3.1.2 Key Derivation

**HKDF-SHA256:** RFC 5869 HMAC-based Key Derivation Function
```
derivedKey = HKDF-SHA256(
    ikm: inputKeyMaterial,
    salt: saltValue,
    info: contextInfo,
    length: outputLength
)
```

#### 3.1.3 Authenticated Encryption

**AES-256-GCM:** Authenticated encryption with associated data
```
(ciphertext, tag) = AES-256-GCM-Encrypt(
    plaintext: data,
    key: encryptionKey,
    nonce: nonce,
    aad: additionalAuthenticatedData
)

plaintext = AES-256-GCM-Decrypt(
    ciphertext: ciphertext,
    key: decryptionKey,
    nonce: nonce,
    tag: authenticationTag,
    aad: additionalAuthenticatedData
)
```

**Properties:**
- Key length: 32 bytes (256 bits)
- Nonce length: 12 bytes (96 bits)
- Tag length: 16 bytes (128 bits)

#### 3.1.4 Digital Signatures

**ECDSA on secp256k1:** Bitcoin's standard signature algorithm
```
signature = ECDSA-Sign(message, privateKey)
valid = ECDSA-Verify(message, signature, publicKey)
```

**Signature format:** DER-encoded (standard Bitcoin format)

#### 3.1.5 Output Commitment

Cryptographically binds the decryption key to a specific transaction output:

```
outputScript = bitcoin.address.toOutputScript(address, network)
amountBytes = encodeUint64LE(amount)
outputCommitment = SHA256(outputScript || amountBytes)
```

**Properties:**
- Deterministic: same address + amount → same commitment
- Collision-resistant: different address or amount → different commitment
- Computable by creator: knows address and amount from rules
- Verifiable by recipient: computes from actual PoA transaction

#### 3.1.6 Challenge Generation

The challenge is a deterministic value derived from vault parameters:

```
challengeInput = concat(
    'LOCK-v1-CHALLENGE',
    vaultId,
    recipientAddress,
    outputCommitment
)
challenge = SHA256(challengeInput)
```

**Properties:**
- Deterministic: can be recomputed and verified
- Unique per vault: includes vaultId
- Binds to recipient: includes recipientAddress
- Binds to PoA requirements: includes outputCommitment

### 3.2 Data Structures

#### 3.2.1 PoA Requirements

Defines the conditions that must be met to unseal a vault.

```typescript
interface PoARequirements {
    recipientAddress: string;       // Bitcoin address (any type)
    amount: number;                 // Satoshis (uint64)
    confirmations: number;          // Minimum confirmations required
    timeLock?: number;              // Optional block height restriction
}
```

**Storage:** Plaintext in vault (recipient needs to read to create PoA)

#### 3.2.2 Vault Structure

Complete encrypted vault with all metadata needed for unsealing.

```typescript
interface Vault {
    version: number;                // Protocol version (0x01)
    vaultId: Uint8Array;           // Unique identifier (32 bytes)
    challenge: Uint8Array;         // Challenge to sign (32 bytes)
    outputCommitment: Uint8Array;  // Output commitment (32 bytes)
    rules: PoARequirements;        // Access requirements (plaintext)
    encryptedMasterKey: Uint8Array; // Encrypted master key
    masterKeyNonce: Uint8Array;    // AES-GCM nonce (12 bytes)
    masterKeyTag: Uint8Array;      // AES-GCM tag (16 bytes)
    ciphertext: Uint8Array;        // Encrypted payload
    payloadNonce: Uint8Array;      // AES-GCM nonce (12 bytes)
    payloadTag: Uint8Array;        // AES-GCM tag (16 bytes)
}
```

### 3.3 Vault Sealing (Encryption)

**Inputs:**
- `payload: Uint8Array` - Data to encrypt
- `recipientAddress: string` - Recipient's Bitcoin address
- `amount: number` - Required PoA output amount in satoshis
- `confirmations?: number` - Minimum confirmations (default: 1)
- `timeLock?: number` - Optional block height restriction

**Algorithm:**

```
1. Generate vault ID
   vaultId = randomBytes(32)

2. Compute output commitment
   outputScript = bitcoin.address.toOutputScript(recipientAddress, network)
   amountBytes = encodeUint64LE(amount)
   outputCommitment = SHA256(outputScript || amountBytes)

3. Generate challenge
   challengeInput = concat(
       'LOCK-v1-CHALLENGE',
       vaultId,
       recipientAddress,
       outputCommitment
   )
   challenge = SHA256(challengeInput)

4. Generate random master key
   masterKey = randomBytes(32)

5. Encrypt payload with master key
   payloadNonce = randomBytes(12)
   payloadAAD = vaultId || challenge
   (ciphertext, payloadTag) = AES-256-GCM-Encrypt(
       plaintext: payload,
       key: masterKey,
       nonce: payloadNonce,
       aad: payloadAAD
   )

6. Derive base key for encrypting master key
   baseKey = HKDF-SHA256(
       ikm: challenge,
       salt: 'LOCK-v1-BASE',
       info: vaultId || outputCommitment,
       length: 32
   )

7. Encrypt master key with base key
   masterKeyNonce = randomBytes(12)
   masterKeyAAD = vaultId || outputCommitment
   (encryptedMasterKey, masterKeyTag) = AES-256-GCM-Encrypt(
       plaintext: masterKey,
       key: baseKey,
       nonce: masterKeyNonce,
       aad: masterKeyAAD
   )

8. Create vault structure
   vault = {
       version: 0x01,
       vaultId,
       challenge,
       outputCommitment,
       rules: { recipientAddress, amount, confirmations, timeLock },
       encryptedMasterKey,
       masterKeyNonce,
       masterKeyTag,
       ciphertext,
       payloadNonce,
       payloadTag
   }
```

**Output:** `vault: Vault`

**Cost:** $0 (entirely off-chain operation)

### 3.4 Vault Unsealing (Decryption)

**Inputs:**
- `vault: Vault` - Vault to decrypt
- `recipientPriv: Uint8Array` - Recipient's address private key (32 bytes)
- `poaTxid: string` - Proof-of-access transaction ID

**Algorithm:** See SPEC.md for complete unsealing algorithm.

---

## 4. Rationale

### 4.1 Why Signature-Based Key Derivation?

Bitcoin addresses contain only public key hashes. Traditional ECDH requires the actual public key, which is only revealed when an address spends. Signature-based derivation works with any address by using the recipient's ability to sign as proof of ownership.

### 4.2 Why Two-Stage Encryption?

Separates payload encryption (fast, random key) from access control (signature-derived key). This allows large payloads without performance impact while maintaining security.

### 4.3 Why Include Merkle Root?

Adds unpredictable entropy that cannot be known until PoA is mined. Even if signature were compromised, attacker still needs merkle root.

### 4.4 Why Output Commitment?

Cryptographically binds decryption key to specific transaction output. Wrong address or amount → wrong key → decryption fails.

---

## 5. Security Analysis

See SPEC.md for complete security analysis including threat model, attack resistance, and formal security properties.

---

## 6. Backwards Compatibility

This is a new protocol with no previous versions. Future versions must maintain compatibility with v1.0 vaults or provide clear migration paths.

---

## 7. Reference Implementation

Reference implementation available at: https://github.com/orangecheck/oc-lock

Implementation language: TypeScript
Dependencies: bitcoinjs-lib, @noble/secp256k1, Web Crypto API

---

## 8. Test Vectors

See SPEC.md for complete test vectors.

---

## 9. References

- **RFC 5869:** HMAC-based Extract-and-Expand Key Derivation Function (HKDF)
- **RFC 5116:** An Interface and Algorithms for Authenticated Encryption
- **RFC 6979:** Deterministic ECDSA
- **BIP 173:** Bech32
- **BIP 350:** Bech32m
- **Bonneau et al. (2015):** "On Bitcoin as a public randomness source"
- **NIST SP 800-38D:** GCM and GMAC

