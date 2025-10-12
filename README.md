---
title: LOCK Protocol
version: 2.0
status: Draft
license: CC-BY-4.0
---

# LOCK Protocol

**Bitcoin-enforced encryption with cryptographic proof-of-spend**

LOCK (Ledger-Originated Cryptographic Key) is a protocol for encrypting data where decryption cryptographically requires a confirmed Bitcoin transaction with a specific output structure.

---

## The Breakthrough

**Traditional encryption:** Recipient can decrypt anytime (just needs the key)

**LOCK encryption:** Recipient CANNOT decrypt until they:
1. Broadcast a Bitcoin transaction with a specific output (address + amount)
2. Wait for that transaction to be confirmed in a block
3. Use the merkle root from that block for key derivation

**How?** The decryption key is derived from:
- **Merkle root** (unpredictable before mining) - proves transaction was confirmed
- **Output commitment** (hash of output script + amount) - proves correct output structure

**Both are required. Wrong output = wrong key = decryption fails.**

---

## Quick Example

```typescript
// ============================================================================
// CREATOR: Seal vault (no blockchain interaction)
// ============================================================================

const vault = await lock.seal({
  payload: Buffer.from('Secret message'),
  recipientPubkey: bobPublicKey,
  rules: {
    recipientAddress: bobAddress,  // Bob must send to this address
    amount: 100000,                // Bob must send exactly 100k sats
    confirmations: 1
  }
});

// Share vault file anywhere (email, IPFS, QR code, etc.)
await shareVault(vault);

// Cost to creator: $0

// ============================================================================
// RECIPIENT: Create PoA and decrypt
// ============================================================================

// Load vault
const vault = await receiveVault();

// Read rules (stored in plaintext in vault file)
console.log('Must send', vault.rules.amount, 'sats to', vault.rules.recipientAddress);

// Create proof-of-access transaction with EXACT output
const poaTx = await lock.createPoA(vault, myWallet);
// This creates transaction with output: { address: bobAddress, amount: 100000 }

// Broadcast and wait for confirmation
const txid = await bitcoin.broadcast(poaTx);
const block = await bitcoin.waitForConfirmation(txid);

// Decrypt using merkle root from PoA block
const payload = await lock.unseal(vault, {
  privateKey: myPrivateKey,
  poaTxid: txid
});

console.log(payload.toString()); // "Secret message"

// Cost to recipient: 100k sats (self-spend, gets it back) + tx fee (~$0.10)
```

---

## Core Concepts

### 1. Cryptographic Enforcement via Output Commitment

**The key insight:** Bind the decryption key to a specific transaction output structure.

```typescript
// Output commitment (computed by creator)
outputCommitment = SHA256(
  outputScript(recipientAddress) || 
  uint64LE(amount)
)

// Decryption key requires BOTH merkle root AND output commitment
key = HKDF(
  ECDH(recipientPriv, creatorPub),
  merkleRoot || outputCommitment,  // ← Both required!
  vaultId
)
```

**Recipient MUST:**
- ✅ Create transaction with exact output: `recipientAddress, amount`
- ✅ Broadcast to Bitcoin network
- ✅ Wait for confirmation
- ✅ Use merkle root from that block

**Recipient CANNOT:**
- ❌ Use different address (wrong output commitment)
- ❌ Use different amount (wrong output commitment)
- ❌ Decrypt without broadcasting (no merkle root)
- ❌ Decrypt offline (no merkle root)

**Wrong output = wrong commitment = wrong key = decryption fails**

**This is cryptographically enforced, not client-side validated.**

### 2. Self-Spend Transaction

**PoA transaction is a self-spend:**

```
Input:  Recipient's UTXO (150,000 sats)
Output: Recipient's address (100,000 sats)  ← Required by rules
Fee:    50,000 sats (to miners)
```

**This proves:**
- ✅ Recipient has Bitcoin (owns UTXOs)
- ✅ Recipient expended value (100k sats + fee)
- ✅ Recipient is committed (real cost)

**Privacy benefit:**
- ✅ Recipient sends to their own address (self-spend)
- ✅ No payment to creator (no on-chain link)
- ✅ Observer sees normal transaction

### 3. Vault File Structure

```typescript
interface Vault {
  // Encrypted payload
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
  
  // Creator's public key (for ECDH)
  creatorPubkey: Uint8Array;
  
  // Output commitment (binds key to specific output)
  outputCommitment: Uint8Array;  // SHA256(outputScript || amount)
  
  // Access rules (PLAINTEXT - not encrypted!)
  rules: {
    recipientAddress: string;
    amount: number;
    confirmations: number;
  };
  
  // Identity
  vaultId: string;
}
```

**Key design decision:** Rules are stored in plaintext (not encrypted) because:
- Recipient needs to know the rules to create the PoA transaction
- Rules don't contain secrets (just requirements)
- Output commitment cryptographically enforces the rules

### 4. The Two Core Operations

**seal()** - Encrypt payload (no blockchain interaction)
```typescript
const vault = await lock.seal({
  payload,
  recipientPubkey,
  rules: {
    recipientAddress,
    amount,
    confirmations
  }
});
```

**unseal()** - Decrypt after PoA confirmation
```typescript
const payload = await lock.unseal(vault, {
  privateKey: recipientPriv,
  poaTxid: txid  // Transaction ID of PoA
});
```

---

## Security Model

### Cryptographically Enforced

✅ **Authorized wallet** - Only holder of private key can decrypt (ECDH)
✅ **PoA broadcast** - Must broadcast transaction to get merkle root
✅ **PoA confirmation** - Must wait for mining to get merkle root
✅ **Exact output address** - Output commitment enforces specific address
✅ **Exact output amount** - Output commitment enforces specific amount

**All of these are cryptographically enforced. No client-side validation needed.**

### Client-Side Validated

⚠️ **Time locks** - Block height check (bypassable but detectable)
⚠️ **Double-spend** - After N confirmations, expensive/difficult but possible

### What LOCK Guarantees

**LOCK cryptographically guarantees:**
- ✅ Recipient CANNOT decrypt without broadcasting transaction with exact output
- ✅ Recipient CANNOT decrypt without confirmation
- ✅ Recipient MUST create output with exact address specified in rules
- ✅ Recipient MUST create output with exact amount specified in rules
- ✅ Access attempts are auditable on blockchain

**LOCK does NOT guarantee:**
- ❌ Recipient cannot double-spend after decrypting (economically difficult)
- ❌ Recipient cannot bypass time locks (client-side validation)

---

## Design Philosophy

### Sovereign Access Layer

**From Bram Kanstein's vision:**

> "LOCK turns access control into an act of energy. A Bitcoin transaction that meets those conditions is the only way to decrypt. There are no accounts. No identities. No passwords to reset. No servers. No on-chain data storage. Just proof."

**LOCK implements:**
- ✅ Access through proof-of-spend (must create specific output)
- ✅ No accounts, no servers, no trusted parties
- ✅ No on-chain data storage (vault file is off-chain)
- ✅ Cryptographic enforcement (not client-side validation)

### Minimal On-Chain Footprint

**Per vault access:**
- 1 transaction (PoA only)
- ~200-250 bytes
- Cost: amount + tx fee

**No binding transaction**
**No OP_RETURN data**
**No on-chain registry**

### Privacy-First

**On-chain observer sees:**
- Someone sent X sats to an address
- That address might be their own (self-spend)
- Standard Bitcoin transaction

**On-chain observer CANNOT see:**
- Who created the vault
- Link between creator and recipient
- What's inside the vault
- That this is a LOCK transaction

---

## Use Cases

### ✅ Where LOCK Excels

**Proof-of-Stake Access**
- Prove you staked specific amount to access
- Cryptographically enforced stake amount
- Self-spend (get your stake back)

**Paid Content (Self-Funded)**
- Prove you have X Bitcoin to access
- Self-spend (you keep the Bitcoin)
- Economic barrier without payment

**Legal Communications**
- Provable delivery (PoA on blockchain)
- Timestamped access (block timestamp)
- Immutable audit trail
- Specific stake requirement

**Confidential Communications**
- No on-chain link between parties
- Cryptographically enforced access
- Proof-of-stake spam protection

### ❌ Where LOCK Doesn't Work

**Direct Payment to Creator** - Self-spend means recipient keeps the funds
**Casual Messaging** - Stake amount + fee too expensive for high-frequency use
**Instant Access** - Must wait ~10 minutes for confirmation
**Offline Access** - Requires blockchain interaction

---

## On-Chain Footprint

### Per Vault Access

**PoA Transaction:**
- Size: ~200-250 bytes
- Cost: stake amount (self-spend, get it back) + tx fee (~$0.10)
- Data: Output to recipient's address with specific amount

**Total:** 1 transaction per access

### Privacy Analysis

**Public on-chain:**
- Transaction exists
- Output: address + amount
- Timestamp (block time)

**NOT revealed:**
- Vault exists (no on-chain record)
- Who created vault
- Link between creator and recipient
- Vault contents
- That this is a LOCK transaction (looks like normal TX)

---

## Architecture

### Key Derivation Flow

```
Creator:
  1. Generate ephemeral keypair
  2. Compute ECDH(creatorPriv, recipientPub)
  3. Compute outputCommitment = SHA256(outputScript || amount)
  4. Derive key = HKDF(sharedSecret, merkleRoot || outputCommitment, vaultId)
  5. Encrypt payload with key
  6. Store creatorPub, outputCommitment, rules (plaintext) in vault
  7. Share vault file (off-chain)

Recipient:
  1. Receive vault file
  2. Read rules (plaintext)
  3. Create PoA transaction with exact output from rules
  4. Broadcast and wait for confirmation
  5. Get merkle root from PoA block
  6. Compute ECDH(recipientPriv, creatorPub)
  7. Compute outputCommitment from actual transaction
  8. Derive key = HKDF(sharedSecret, merkleRoot || outputCommitment, vaultId)
  9. Decrypt payload
```

### Why This Works

**Merkle root:**
- Unpredictable before mining
- Proves transaction was confirmed
- Deterministic after mining

**Output commitment:**
- Deterministic from output structure
- Creator can compute it (knows address + amount)
- Recipient must match it (or decryption fails)

**Combined:**
- Merkle root proves PoA was broadcast and confirmed
- Output commitment proves PoA has correct output
- Both required for decryption key
- Wrong output = wrong key = garbage decryption

---

## Comparison to Alternatives

### vs Traditional Encryption (PGP, Age)

| Feature | LOCK | PGP/Age |
|---------|------|---------|
| Access Control | ✅ Cryptographic | ❌ None |
| Proof-of-Spend | ✅ Required | ❌ None |
| Amount Enforcement | ✅ Cryptographic | ❌ None |
| Audit Trail | ✅ Blockchain | ❌ None |
| Privacy | ✅ Excellent | ✅ Excellent |
| Cost | ❌ Stake + fee | ✅ Free |

### vs Smart Contracts (Ethereum)

| Feature | LOCK | Smart Contracts |
|---------|------|-----------------|
| Enforcement | ✅ Cryptographic | ✅ Consensus |
| Bitcoin-native | ✅ Yes | ❌ No |
| Fees | ✅ Low | ❌ High ($1-50) |
| Privacy | ✅ Excellent | ❌ Poor |
| On-chain data | ✅ None | ❌ All data |

---

## Getting Started

### Documentation

- **[PROTOCOL.md](./PROTOCOL.md)** - Complete protocol specification
- **[SPEC.md](./SPEC.md)** - Normative implementation requirements
- **[DESIGN.md](./DESIGN.md)** - Design decisions and rationale

### Community

- **GitHub:** [github.com/orangecheck/lock-protocol](https://github.com/orangecheck/lock-protocol)
- **Discussions:** [GitHub Discussions](https://github.com/orangecheck/lock-protocol/discussions)

---

## License

CC-BY-4.0

---

## Acknowledgments

**Vision:** Bram Kanstein (@bramk) - Sovereign Access Layer concept

**Breakthrough:** Using Bitcoin's merkle root + output commitment for cryptographic enforcement

**Academic foundation:** Bonneau et al. (2015) - "On Bitcoin as a public randomness source"

**Built on:**
- Bitcoin's merkle tree design (Nakamoto, 2008)
- ECDH key exchange (Diffie-Hellman, 1976)
- HKDF key derivation (Krawczyk, 2010)
- AES-GCM authenticated encryption (NIST, 2007)

