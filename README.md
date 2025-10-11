# LOCK Protocol

*Bitcoin-secured encryption with proof-of-access gating. Seal once, bind to chain, unseal with cryptographic proof.*

[![Status](https://img.shields.io/badge/status-draft-informational)](#) [![License](https://img.shields.io/badge/license-CC--BY--4.0%20%2F%20MIT-blue)](#)

---

## What is LOCK?

**LOCK (Ledger-Originated Cryptographic Key) is a Bitcoin-native encryption protocol** that combines:

- **Seal** — Encrypt any data (messages, files, secrets) with AES-256-GCM
- **Rules** — Define who can decrypt and under what on-chain conditions
- **Bind** — Anchor to Bitcoin blockchain with a simple self-spend transaction
- **Unseal** — Decrypt only after proving on-chain conditions are met (Proof-of-Access)

### The Problem

Current encryption solutions are:
- **Custodial** — Keys held by third parties (Proton, Signal servers)
- **Unverifiable** — No proof of access conditions
- **Centralized** — Single points of failure
- **Non-portable** — Locked to specific platforms

### The Solution

LOCK provides **Bitcoin-secured, non-custodial encryption** through:
- **Proof-of-Access (PoA)** — On-chain transaction proves right to decrypt
- **Rebindable** — Transfer access without re-encrypting
- **Auditable** — All access attempts verifiable on-chain
- **Portable** — `.seal` files work anywhere

---

## Core Concepts

### Terminology

- **SEAL** — The encrypted file/data structure (ciphertext + nonce + tag)
- **Rules (Metadata)** — Encrypted policy defining access conditions
- **Bind (TXID)** — On-chain transaction anchoring the vault
- **Vault** — The composite: `{ SEAL, Rules, TXID }` with canonical ID
- **Proof-of-Access (PoA)** — Confirmed transaction satisfying all rules
- **Vault ID** — `SHA-256(SEAL || metadata || txid)` - canonical identifier

### The Four Operations

```
1. seal()    → Create encrypted SEAL from payload
2. bind()    → Anchor SEAL + Rules to blockchain
3. unseal()  → Decrypt SEAL after PoA validation
4. rebind()  → Transfer access to new wallet (without re-encrypting)
```

### Why Vault ≠ SEAL

**SEAL** is just the encrypted blob. **Vault** is the complete system:

- **SEAL** — Portable encrypted container (no policy, no identity)
- **Rules** — Separate encrypted metadata (who, what, when, how many)
- **Bind** — On-chain anchor creating canonical identity
- **Vault** — All three combined, enabling:
  - Policy enforcement (Rules)
  - Canonical identity & audit (Vault ID)
  - Rebinding (transfer access without re-encryption)
  - Unlock counters & replay control

**You can't have PoA, rebinding, or auditability with just a SEAL.**

---

## Access Rules (Metadata)

### Authorized Wallet

Who can unseal:
```typescript
authorizedWallet: 'bc1q...'           // Single wallet
authorizedWallet: ['bc1q...', 'bc1p...'] // Multiple wallets
authorizedWallet: 'ANY'                // Anyone (public SEAL)
```

### Amount Condition

How much must be sent:
```typescript
amountCondition: { type: 'fixed', amount: 10000 }  // Exactly 10k sats
amountCondition: { type: 'range', min: 1000, max: 100000 } // 1k-100k sats
```

### Recipient Wallet

Where funds must go:
```typescript
recipientWallet: 'self'      // To authorized wallet (self-spend)
recipientWallet: 'bc1q...'   // To specific address
```

### Time Lock

When unsealing is allowed:
```typescript
timeLock: 850000  // After block 850000
```

### Unlock Limit

How many times:
```typescript
unlockLimit: 1        // One-time use
unlockLimit: 5        // Up to 5 unseals
unlockLimit: undefined // Unlimited
```

---

## Use Cases

### Secure Messaging (SealChat)

Encrypt conversations with Bitcoin-gated access:
```typescript
// Alice seals message for Bob
const seal = await createSeal(message, sealKey);
const metadata = createSealMetadata({
  authorizedWallet: bobAddress,
  amountCondition: { type: 'fixed', amount: 546 }, // Dust limit
  recipientWallet: 'self',
});
```

### Dead Man's Switch

Release secrets after time lock:
```typescript
const metadata = createSealMetadata({
  authorizedWallet: heirAddress,
  amountCondition: { type: 'fixed', amount: 1000 },
  timeLock: currentBlock + 52560, // ~1 year
  unlockLimit: 1,
});
```

### Paid Content

Sell access to encrypted files:
```typescript
const metadata = createSealMetadata({
  authorizedWallet: 'ANY', // Anyone can buy
  amountCondition: { type: 'fixed', amount: 100000 }, // 100k sats
  recipientWallet: creatorAddress, // Payment to creator
  unlockLimit: undefined, // Unlimited access after payment
});
```

### Multi-Sig Vault

Require multiple parties:
```typescript
const metadata = createSealMetadata({
  authorizedWallet: [alice, bob, carol], // Any of 3
  amountCondition: { type: 'fixed', amount: 1000 },
  unlockLimit: 1, // First to unlock wins
});
```

---

## Security Model

### Key Derivation

LOCK uses **ECDH + HKDF** for key derivation:

```
1. Creator generates ephemeral keypair
2. ECDH with recipient's pubkey → shared_secret
3. HKDF(shared_secret || seal_hash) → { metadataKey, sealKey }
4. Encrypt SEAL and metadata with derived keys
5. Prove creator key ownership at bind() time
```

**Important:** Key derivation does NOT use TXID, so you can seal before binding.

### Proof-of-Access Validation

PoA transaction MUST satisfy ALL conditions:

- ✅ **Confirmed** — At least 1 confirmation
- ✅ **Non-RBF** — Not replaceable (prevents double-spend)
- ✅ **Wallet match** — From authorized wallet
- ✅ **Recipient match** — To required recipient (if specified)
- ✅ **Amount match** — Satisfies amount condition
- ✅ **Time lock** — After specified block height (if set)
- ✅ **Unlock limit** — Not exceeded (if set)

### Rebinding Security

Rebinding transfers access without re-encrypting:

```typescript
// Original vault bound to Alice
const originalVault = { seal, metadata: { authorizedWallet: alice }, txid1 };

// Rebind to Bob
const newMetadata = { ...metadata, authorizedWallet: bob };
const newTxid = await rebind(originalVault, newMetadata);

// New vault ID, same SEAL
const newVault = { seal, metadata: newMetadata, txid: newTxid };
```

**Security:** SEAL never changes, only metadata + binding TX.

---

## Documentation

- **[SPEC.md](SPEC.md)** — Normative specification for implementers
- **[PROTOCOL.md](PROTOCOL.md)** — Protocol design and rationale
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — System architecture and data flow
- **[registry/algorithms.md](registry/algorithms.md)** — Encryption algorithm registry
- **[registry/conditions.md](registry/conditions.md)** — Amount condition types

---

## License

- **Protocol & Spec text**: CC‑BY‑4.0
- **Reference code**: MIT

---

**Built with Bitcoin. Secured by proof. Portable everywhere.**

