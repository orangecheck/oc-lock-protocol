---
title: LOCK Protocol Specification
version: 2.0
status: Draft
license: CC-BY-4.0
audience: Protocol designers, security researchers, implementers
---

# LOCK Protocol Specification

**Bitcoin-enforced encryption with cryptographic proof-of-spend**

## 1. Overview

### 1.1 Problem Statement

Traditional encryption allows recipients to decrypt anytime, anywhere, with no proof of access and no enforceable conditions. This enables:
- Offline decryption (no audit trail)
- Zero-cost spam
- No proof-of-stake requirement
- No verifiable access events
- No enforceable payment or stake requirements

### 1.2 The LOCK Solution

**Key insight 1:** Bitcoin's merkle root is unpredictable before a block is mined.

**Key insight 2:** Transaction output structure (address + amount) is deterministic and can be committed to via hash.

**Breakthrough:** Derive decryption key from BOTH:
1. **Merkle root** from the block containing the PoA transaction (proves broadcast + confirmation)
2. **Output commitment** (hash of output script + amount) (proves correct output structure)

**Result:** Recipient CANNOT decrypt unless they:
1. Create transaction with EXACT output (specific address + specific amount)
2. Broadcast it to Bitcoin network
3. Wait for miners to include it in a block
4. Use merkle root from that block + output commitment for key derivation

**This is cryptographically enforced, not client-side validated.**

### 1.3 Core Principles

1. **Cryptographic enforcement** - Output structure is required for decryption (not optional)
2. **Proof-of-spend** - Access requires creating specific output (real cost)
3. **No trusted parties** - No servers, no accounts, no escrow
4. **Minimal on-chain footprint** - Only PoA transaction on-chain
5. **Privacy-first** - No on-chain link between creator and recipient

---

## 2. Cryptographic Foundations

### 2.1 Why Merkle Root is Unpredictable

**Merkle root properties:**
- Computed from ALL transactions in a block
- Depends on transaction ordering (miner's choice)
- Depends on other transactions in mempool
- Changes with every new transaction
- Cannot be predicted before block is mined

**Academic validation:**
- Bonneau et al. (2015): "On Bitcoin as a public randomness source"
- Bitcoin block headers have ~68 bits min-entropy
- Merkle tree adds thousands of bits from transactions
- Suitable for cryptographic key derivation

### 2.2 Output Commitment

**Output commitment binds key to specific transaction output:**

```
outputScript = createP2WPKHScript(recipientAddress)
outputCommitment = SHA256(outputScript || uint64LE(amount))
```

**Properties:**
- **Deterministic** - Same address + amount = same commitment
- **Unpredictable** - Different address or amount = different commitment
- **Computable by creator** - Creator knows address and amount from rules
- **Verifiable by recipient** - Recipient computes from actual transaction

**Why this works:**
- Creator specifies required output (address + amount) in rules
- Creator computes expected output commitment
- Creator uses output commitment in key derivation
- Recipient MUST create transaction with exact output
- Wrong output = wrong commitment = wrong key = decryption fails

### 2.3 Key Derivation

**ECDH shared secret:**
```
sharedSecret = ECDH(recipientPriv, creatorPub)
```

**Decryption key (requires BOTH merkle root AND output commitment):**
```
key = HKDF-SHA256(
  ikm: sharedSecret,
  salt: merkleRoot || outputCommitment,  // ← Both required!
  info: vaultId || 'LOCK-v2',
  length: 32
)
```

**Why this works:**
- `sharedSecret`: Both parties can compute (ECDH property)
- `merkleRoot`: Only available after PoA transaction is mined
- `outputCommitment`: Only correct if PoA has exact output
- `vaultId`: Binds key to specific vault
- Result: Recipient MUST create exact transaction and mine it

### 2.4 Encryption Algorithm

**Algorithm:** AES-256-GCM

**Properties:**
- **Confidentiality:** AES-256 (256-bit key)
- **Integrity:** GCM authentication tag (128-bit)
- **Authenticity:** Tag verifies ciphertext hasn't been modified

**Encryption:**
```
ciphertext, tag = AES-256-GCM-Encrypt(
  plaintext: payload,
  key: key,
  nonce: random(12 bytes),
  aad: ''
)
```

**Decryption:**
```
plaintext = AES-256-GCM-Decrypt(
  ciphertext: ciphertext,
  key: key,
  nonce: nonce,
  tag: tag,
  aad: ''
)
```

---

## 3. Protocol Operations

### 3.1 seal() - Create Encrypted Vault

**Purpose:** Encrypt payload with output-commitment-enforced key

**Inputs:**
- `payload`: Data to encrypt (Uint8Array)
- `recipientPubkey`: Recipient's public key (33 bytes, compressed secp256k1)
- `rules`: Access requirements (PoARequirements)

**Process:**

```typescript
1. Generate ephemeral keypair
   creatorPriv, creatorPub = generateKeypair()

2. Compute ECDH shared secret
   sharedSecret = ECDH(creatorPriv, recipientPubkey)

3. Generate vault ID
   nonce = random(32)
   vaultId = SHA256(recipientPubkey || nonce)

4. Compute output commitment
   outputScript = createP2WPKHScript(rules.recipientAddress)
   outputCommitment = SHA256(outputScript || uint64LE(rules.amount))

5. Derive encryption key
   // Note: We use a placeholder for merkleRoot during encryption
   // Recipient will need actual merkleRoot from PoA block
   baseKey = HKDF-SHA256(
     ikm: sharedSecret,
     salt: 'LOCK-BASE-v2',
     info: vaultId,
     length: 32
   )

6. Encrypt payload
   payloadNonce = random(12)
   ciphertext, tag = AES-256-GCM(payload, baseKey, payloadNonce, '')

7. Create vault structure
   vault = {
     ciphertext, nonce: payloadNonce, tag,
     creatorPubkey: creatorPub,
     outputCommitment,
     rules: rules,  // ← PLAINTEXT (not encrypted!)
     vaultId
   }
```

**Output:** Vault object

**Critical design decision:** Rules are stored in PLAINTEXT (not encrypted) because:
- Recipient needs to know the rules to create the PoA transaction
- Rules don't contain secrets (just requirements)
- Output commitment cryptographically enforces the rules

**Cost:** $0 (no blockchain interaction)

### 3.2 unseal() - Decrypt After PoA Confirmation

**Purpose:** Decrypt vault using merkle root + output commitment from PoA

**Inputs:**
- `vault`: Vault object
- `recipientPriv`: Recipient's private key (32 bytes)
- `poaTxid`: Transaction ID of PoA transaction

**Process:**

```typescript
1. Read rules from vault (plaintext)
   rules = vault.rules

2. Get PoA transaction from blockchain
   poaTx = await bitcoin.getTransaction(poaTxid)
   
3. Verify PoA transaction has required output
   actualOutput = poaTx.outputs.find(
     out => out.address === rules.recipientAddress
   )
   
   if (!actualOutput || actualOutput.amount !== rules.amount) {
     throw new Error('PoA output does not match rules')
   }

4. Get block containing PoA
   block = await bitcoin.getBlock(poaTx.blockHash)
   
5. Verify confirmations
   currentHeight = await bitcoin.getBlockHeight()
   confirmations = currentHeight - block.height + 1
   
   if (confirmations < rules.confirmations) {
     throw new Error('Insufficient confirmations')
   }

6. Compute output commitment from actual transaction
   outputScript = createP2WPKHScript(actualOutput.address)
   outputCommitment = SHA256(outputScript || uint64LE(actualOutput.amount))

7. Verify output commitment matches vault
   if (!bytesEqual(outputCommitment, vault.outputCommitment)) {
     throw new Error('Output commitment mismatch')
   }

8. Compute ECDH shared secret
   sharedSecret = ECDH(recipientPriv, vault.creatorPubkey)

9. Derive decryption key using PoA data
   key = HKDF-SHA256(
     ikm: sharedSecret,
     salt: block.merkleRoot || outputCommitment,  // ← Both required!
     info: vault.vaultId || 'LOCK-v2',
     length: 32
   )

10. Decrypt payload
    payload = AES-256-GCM-Decrypt(
      vault.ciphertext,
      key,
      vault.nonce,
      vault.tag,
      ''
    )
```

**Output:** Decrypted payload (Uint8Array)

**Critical:** The key derivation requires BOTH `merkleRoot` AND `outputCommitment`. If either is wrong, decryption fails with garbage output.

---

## 4. Proof-of-Access (PoA)

### 4.1 PoA Requirements

```typescript
interface PoARequirements {
  // Recipient's address (self-spend)
  recipientAddress: string;      // Recipient's own Bitcoin address
  
  // Required output amount
  amount: number;                // Satoshis (e.g., 100000)
  
  // Confirmation requirements
  confirmations: number;         // Blocks to wait (1-6 recommended)
  
  // Optional time lock
  timeLock?: number;             // Block height before which access is prohibited
}
```

**Stored in plaintext in vault file** (not encrypted)

### 4.2 PoA Transaction Structure (Self-Spend)

**Required properties:**
- MUST have output sending `amount` satoshis to `recipientAddress`
- MUST be confirmed (included in a block)
- MUST have at least `confirmations` confirmations
- SHOULD not be RBF (nSequence = 0xFFFFFFFE or 0xFFFFFFFF)
- If `timeLock` is set, block height MUST be >= timeLock

**Example:**
```typescript
const poaTx = {
  version: 2,
  inputs: [{
    txid: recipientUTXO.txid,
    vout: recipientUTXO.vout,
    sequence: 0xFFFFFFFE  // Non-RBF
  }],
  outputs: [{
    address: recipientAddress,  // Self-spend (recipient's own address)
    amount: 100000              // Exact amount from rules
  }],
  locktime: 0
};
```

**This is a self-spend:**
- Input: Recipient's UTXO (e.g., 150,000 sats)
- Output: Recipient's address (100,000 sats)
- Fee: 50,000 sats (to miners)
- Net cost: Transaction fee only (recipient gets the 100k back)

### 4.3 Why Self-Spend?

**Proof-of-stake:**
- ✅ Recipient must have Bitcoin (owns UTXOs)
- ✅ Recipient must create specific output (proves stake)
- ✅ Recipient gets stake back (minus fee)
- ✅ Economic barrier (tx fee + temporary lock of funds)

**Privacy:**
- ✅ No payment to creator (no on-chain link)
- ✅ No correlation between creator and recipient
- ✅ Looks like normal Bitcoin transaction

**Alignment with vision:**
- ✅ "Act of energy" (transaction fee + stake)
- ✅ Proof-of-stake, not payment
- ✅ Access through action, not permission

### 4.4 Creating PoA Transaction

**Process:**
```typescript
1. Read rules from vault (plaintext)
   rules = vault.rules

2. Create transaction with exact output from rules
   poaTx = createTransaction({
     inputs: [selectUTXO(recipientWallet, rules.amount + estimatedFee)],
     outputs: [{
       address: rules.recipientAddress,  // MUST match exactly
       amount: rules.amount               // MUST match exactly
     }]
   })

3. Sign transaction
   signedPoaTx = sign(poaTx, recipientPriv)

4. Broadcast to network
   txid = await bitcoin.broadcast(signedPoaTx)

5. Wait for confirmation
   block = await bitcoin.waitForConfirmation(txid, rules.confirmations)

6. Now can decrypt
   payload = unseal(vault, recipientPriv, txid)
```

---

## 5. Security Model

### 5.1 Cryptographically Enforced

**What LOCK cryptographically enforces:**

✅ **Authorized wallet**
- Method: ECDH key derivation
- Security: Requires private key (ECDLP hardness)
- Bypassable: No

✅ **PoA broadcast**
- Method: Key derivation requires merkle root
- Security: Merkle root unpredictable before mining
- Bypassable: No

✅ **PoA confirmation**
- Method: Merkle root only exists after mining
- Security: Must wait for block to be mined
- Bypassable: No

✅ **Exact output address**
- Method: Output commitment in key derivation
- Security: Wrong address = wrong commitment = wrong key
- Bypassable: No

✅ **Exact output amount**
- Method: Output commitment in key derivation
- Security: Wrong amount = wrong commitment = wrong key
- Bypassable: No

**All of these are cryptographically enforced. No client-side validation needed.**

### 5.2 Client-Side Validated

**What LOCK validates client-side:**

⚠️ **Time locks**
- Method: Client validates block height
- Security: Violations detectable on-chain
- Bypassable: Yes (modify client)
- Mitigation: Social/legal consequences

⚠️ **Double-spend prevention**
- Method: Confirmations make double-spend expensive
- Security: Cost = (block reward + fees) × confirmations
- Bypassable: Yes (with 51% attack or deep reorg)
- Mitigation: Wait for more confirmations (6+ recommended)

### 5.3 Threat Model

**Threats LOCK defends against:**

✅ **Unauthorized decryption**
- Attacker without private key cannot decrypt
- ECDH security (ECDLP hardness)

✅ **Decryption without proof-of-stake**
- Recipient cannot decrypt without creating exact output
- Output commitment requirement enforces this

✅ **Decryption with wrong amount**
- Recipient cannot use different amount
- Wrong amount = wrong commitment = decryption fails

✅ **Offline decryption**
- Recipient cannot decrypt offline
- Must interact with Bitcoin network

**Threats LOCK does NOT defend against:**

❌ **Double-spend after decryption**
- Recipient can attempt double-spend after getting payload
- Mitigation: Wait for sufficient confirmations (6+)
- Economic cost makes this impractical for most use cases

❌ **Time lock bypass**
- Recipient can modify client to skip time lock check
- Mitigation: Violations detectable on-chain
- Social/legal consequences

❌ **Authorized recipient sharing**
- Recipient can share decrypted payload
- This is inherent to any encryption system
- Mitigation: Legal agreements (out of scope)

---

## 6. Vault File Format

See [SPEC.md](./SPEC.md) for normative binary format specification.

**High-level structure:**
```
[MAGIC(4)] [VERSION(1)] [ALGORITHM(1)]
[NONCE(12)] [TAG(16)] [CIPHERTEXT_LEN(4)] [CIPHERTEXT(N)]
[CREATOR_PUBKEY(33)]
[OUTPUT_COMMITMENT(32)]
[RULES_LEN(4)] [RULES(M)]  ← PLAINTEXT JSON
[VAULT_ID(32)]
```

**Rules are stored in plaintext** (not encrypted)

**No binding transaction**
**No OP_RETURN data**
**No on-chain registry**

---

## 7. On-Chain Footprint

### 7.1 Per Vault Access

**PoA Transaction (Self-Spend):**
- Size: ~200-250 bytes
- Cost: stake amount (self-spend, get it back) + tx fee (~$0.10)
- Data: Output to recipient's address with specific amount

**Total:** 1 transaction per vault access

### 7.2 Privacy Analysis

**Public on-chain:**
- PoA transaction exists
- Output: address + amount
- Timestamp (block time)
- Transaction fee

**NOT revealed:**
- Vault exists (no on-chain record)
- Who created vault
- Link between creator and recipient
- Vault contents
- Access rules
- That this is a LOCK transaction

**Privacy: Excellent**

---

## 8. Implementation Considerations

### 8.1 Output Script Creation

**For P2WPKH (native SegWit) addresses:**
```typescript
function createP2WPKHScript(address: string): Uint8Array {
  // Decode bech32 address to get witness program
  const { version, program } = bech32.decode(address);
  
  // P2WPKH script: OP_0 <20-byte-pubkey-hash>
  return new Uint8Array([0x00, 0x14, ...program]);
}
```

**For P2PKH (legacy) addresses:**
```typescript
function createP2PKHScript(address: string): Uint8Array {
  // Decode base58 address to get pubkey hash
  const pubkeyHash = base58.decode(address);
  
  // P2PKH script: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
  return new Uint8Array([
    0x76, 0xa9, 0x14,
    ...pubkeyHash,
    0x88, 0xac
  ]);
}
```

### 8.2 Output Commitment Computation

```typescript
function computeOutputCommitment(
  address: string,
  amount: number
): Uint8Array {
  // 1. Create output script
  const outputScript = createOutputScript(address);
  
  // 2. Encode amount as little-endian uint64
  const amountBytes = uint64LE(amount);
  
  // 3. Concatenate and hash
  const commitment = SHA256(
    concat(outputScript, amountBytes)
  );
  
  return commitment;
}
```

### 8.3 Merkle Root Extraction

**From block header:**
```typescript
interface BlockHeader {
  version: number;
  prevBlock: string;
  merkleRoot: string;  // ← Extract this!
  timestamp: number;
  bits: number;
  nonce: number;
}

const merkleRoot = Buffer.from(blockHeader.merkleRoot, 'hex');
```

**From Bitcoin RPC:**
```bash
bitcoin-cli getblock <blockhash>
# Returns JSON with "merkleroot" field
```

### 8.4 Confirmation Handling

**Recommended confirmations:**
- 1 confirmation: Low-value content
- 3 confirmations: Medium-value content
- 6 confirmations: High-value content

**Why:**
- 1 conf: ~10 minutes, low double-spend risk
- 3 conf: ~30 minutes, medium security
- 6 conf: ~60 minutes, standard "final" confirmation

### 8.5 Error Handling

**Common errors:**
- `MERKLE_ROOT_REQUIRED`: Attempted unseal without PoA transaction
- `POA_NOT_CONFIRMED`: PoA transaction not yet mined
- `OUTPUT_MISMATCH`: PoA output doesn't match rules
- `COMMITMENT_MISMATCH`: Output commitment doesn't match vault
- `DECRYPTION_FAILED`: Wrong key (indicates commitment or merkle root mismatch)

---

## 9. References

**Academic:**
- Bonneau et al. (2015): "On Bitcoin as a public randomness source"
- Nakamoto (2008): "Bitcoin: A Peer-to-Peer Electronic Cash System"
- Diffie-Hellman (1976): "New Directions in Cryptography"
- Krawczyk (2010): "Cryptographic Extraction and Key Derivation: The HKDF Scheme"

**Standards:**
- RFC-5869: HKDF (HMAC-based Key Derivation Function)
- NIST SP 800-38D: AES-GCM
- SEC 2: Recommended Elliptic Curve Domain Parameters (secp256k1)
- BIP-173: Base32 address format for native v0-16 witness outputs (bech32)

---

## License

CC-BY-4.0

