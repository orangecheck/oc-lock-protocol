# LOCK Protocol v1.0

## Overview

LOCK is a Bitcoin-enforced encryption protocol that enables trustless, end-to-end encrypted communication and file sharing. Vault files can exist publicly, but only the intended recipient can decrypt them by performing a Bitcoin transaction.

**Core principle:** Decryption keys are cryptographically locked on the Bitcoin blockchain using adaptor signatures. Only the recipient can extract the key by spending a Challenge UTXO.

## Key Features

- **Trustless encryption** - No third parties, no servers, no trust required
- **Public vault files** - .lock files can be shared openly without compromising security
- **Bitcoin-enforced access** - Decryption requires a Bitcoin transaction
- **End-to-end encrypted** - Only sender and recipient can access content
- **Air-gapped compatible** - Works with desktop and hardware wallets via PSBT

## Protocol Flow

### 1. Recipient Identity Setup

The recipient must publish their public key before receiving vaults.

**Steps:**
1. Recipient creates a BIP-322 signature of their Bitcoin address
2. Recipient publishes this signature (website, Nostr, QR code, etc.)
3. Anyone can extract the recipient's public key from this signature

**Why:** Bitcoin addresses are hashes of public keys. To encrypt to an address, the sender needs the actual public key. The BIP-322 signature reveals it while proving address ownership.

### 2. Vault Creation (Sender)

**Steps:**

1. **Generate encryption secret**
   - Create random 32-byte secret `k`

2. **Encrypt the payload (SEAL)**
   - Encrypt files/messages using AES-256-GCM with `k` as the key
   - This creates the SEAL (encrypted payload)

3. **Encrypt metadata**
   - Derive shared secret: `shared_secret = ECDH(sender_privkey, recipient_pubkey)`
   - Derive metadata key: `metadata_key = HKDF(shared_secret || seal_hash, salt="LOCK-METADATA", info="metadata-v1")`
   - Encrypt vault metadata (file names, descriptions, etc.) with this key

4. **Create Challenge UTXO**
   - Generate Taproot (P2TR) address
   - Send small amount (~1000 sats) to this address
   - Record the UTXO txid in vault metadata

5. **Create adaptor signature**
   - Create adaptor signature for spending Challenge UTXO using secret `k`
   - This signature commits to `k` without revealing it
   - Only someone who can complete this signature can extract `k`

6. **Assemble vault file**
   - Package: encrypted SEAL + encrypted metadata + Challenge UTXO info + adaptor signature template
   - Save as .lock file

7. **Send vault to recipient**
   - Email, file share, Nostr DM, USB drive, public hosting, etc.

### 3. Vault Reception (Recipient)

**Steps:**

1. **Receive .lock file**
   - File can be transmitted through any channel (even public/untrusted)

2. **Decrypt metadata**
   - Derive shared secret: `shared_secret = ECDH(recipient_privkey, sender_pubkey)`
   - Derive metadata key: `metadata_key = HKDF(shared_secret || seal_hash, salt="LOCK-METADATA", info="metadata-v1")`
   - Decrypt metadata to see vault contents description

3. **View Challenge UTXO**
   - See Challenge UTXO txid and amount
   - Verify UTXO exists on blockchain
   - Note: Recipient will claim these sats when unsealing

### 4. Unsealing (Recipient)

**Steps:**

1. **Create Challenge spend transaction**
   - Input: Challenge UTXO
   - Output: Recipient's address (claim the sats)
   - Use adaptor signature template from vault file

2. **Sign and broadcast**
   - Complete the adaptor signature (requires recipient's private key)
   - Broadcast transaction
   - Wait for confirmation

3. **Extract secret `k`**
   - Retrieve confirmed transaction from blockchain
   - Extract final signature from transaction
   - Compute: `k = adaptor_extract(final_signature, adaptor_signature_template)`
   - This uses WASM cryptographic library

4. **Decrypt SEAL**
   - Use extracted `k` to decrypt the SEAL
   - Access encrypted files/messages

## Security Properties

### Cryptographic Guarantees

- **Only recipient can decrypt** - Requires recipient's private key for both metadata decryption and Challenge UTXO spending
- **Vault files can be public** - All sensitive data is encrypted; public exposure doesn't compromise security
- **No key escrow** - Decryption key `k` is never transmitted; it's extracted from blockchain
- **Forward secrecy** - Each vault uses unique `k`; compromise of one vault doesn't affect others
- **Tamper-evident** - Any modification to vault file breaks decryption

### Trust Model

- **No trusted third parties** - Protocol is fully peer-to-peer
- **No server infrastructure** - All validation happens client-side using Bitcoin blockchain
- **No coordination required** - Sender and recipient don't need to be online simultaneously

## Technical Requirements

### Cryptographic Primitives

- **ECDH** - Elliptic Curve Diffie-Hellman for metadata encryption
- **HKDF-SHA256** - Key derivation function
- **AES-256-GCM** - Authenticated encryption for SEAL
- **Schnorr signatures (BIP-340)** - For adaptor signatures
- **Taproot (P2TR)** - Required for Challenge UTXO

### Wallet Requirements

- **Desktop or air-gapped wallets** - Browser wallets don't support adaptor signatures
- **Taproot support** - Must support P2TR addresses
- **PSBT support** - For air-gapped signing workflows
- **Custom signing** - Adaptor signature creation/completion (may require plugins)

### Implementation Dependencies

- **WASM library** - For `adaptor_extract()` function
- **Bitcoin node access** - To verify transactions and extract signatures
- **BIP-322 support** - For recipient identity signatures

## Vault File Format

### .lock File Structure

```
{
  "version": 1,
  "seal": {
    "ciphertext": "<base64>",
    "nonce": "<base64>",
    "tag": "<base64>"
  },
  "metadata": {
    "ciphertext": "<base64>",
    "nonce": "<base64>",
    "tag": "<base64>"
  },
  "challenge": {
    "txid": "<hex>",
    "vout": 0,
    "amount": 1000,
    "address": "<taproot_address>"
  },
  "adaptor": {
    "template": "<base64>",
    "pubkey": "<hex>"
  }
}
```

### Metadata Schema (Decrypted)

```json
{
  "sender_pubkey": "<hex>",
  "recipient_pubkey": "<hex>",
  "created_at": 1234567890,
  "seal_hash": "<hex>",
  "description": "Optional vault description",
  "file_count": 3,
  "total_size": 1048576
}
```

## Use Cases

- **Encrypted messaging** - Send messages that only recipient can read
- **Secure file sharing** - Share files with cryptographic access control
- **Dead drops** - Leave encrypted data in public locations
- **Time-delayed disclosure** - Vault files can be published now, unsealed later
- **Whistleblowing** - Anonymous encrypted submissions to known recipients
- **Digital inheritance** - Encrypted data with Bitcoin-based access control

## Future: Proof-of-Access (PoA)

The current protocol enforces that only the recipient can decrypt. A future enhancement could add **Proof-of-Access (PoA)** rules that cryptographically enforce additional conditions:

- **Amount conditions** - Recipient must spend X sats to unseal
- **Time-locks** - Vault cannot be unsealed before block height Y
- **Multi-recipient** - Multiple authorized addresses
- **Unlock limits** - Vault can only be unsealed N times

**Challenge:** Cryptographically enforcing PoA rules requires binding the decryption key to a separate PoA transaction, not just the Challenge UTXO spend. This is an open research problem.

**Current approach:** PoA rules could be implemented as client-side validation (non-cryptographic), where honest clients check conditions before allowing decryption. This provides UX guardrails but not cryptographic enforcement.

## Comparison to Other Protocols

| Feature | LOCK v1.0 | PGP/GPG | Signal | Nostr DMs |
|---------|-----------|---------|--------|-----------|
| Trustless | ✅ | ✅ | ❌ (servers) | ⚠️ (relays) |
| Public vault files | ✅ | ✅ | ❌ | ❌ |
| Bitcoin-enforced | ✅ | ❌ | ❌ | ❌ |
| No key exchange | ✅ | ❌ | ❌ | ❌ |
| Air-gapped compatible | ✅ | ✅ | ❌ | ❌ |

## License

MIT

