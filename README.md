# LOCK Protocol v1.0

**Bitcoin-enforced encryption for trustless, end-to-end encrypted communication.**

## What is LOCK?

LOCK is a protocol that uses Bitcoin's blockchain to enforce access control for encrypted data. Vault files can be shared publicly, but only the intended recipient can decrypt them by performing a Bitcoin transaction.

**Key insight:** Decryption keys are cryptographically locked on the blockchain using adaptor signatures. The key is only revealed when the recipient spends a specific Bitcoin UTXO.

## Core Features

- ✅ **Trustless** - No servers, no third parties, no trust required
- ✅ **Public vaults** - .lock files can be shared openly without security risk
- ✅ **Bitcoin-enforced** - Decryption requires a Bitcoin transaction
- ✅ **End-to-end encrypted** - Only sender and recipient can access content
- ✅ **Air-gapped compatible** - Works with hardware wallets via PSBT

## How It Works

### 1. Recipient Setup
Recipient creates a BIP-322 signature of their Bitcoin address and publishes it. This reveals their public key while proving address ownership.

### 2. Sender Creates Vault
1. Generate random secret `k`
2. Encrypt files with `k` (creates SEAL)
3. Encrypt metadata using ECDH with recipient's public key
4. Create Challenge UTXO (Taproot, ~1000 sats)
5. Create adaptor signature that locks `k` to the Challenge UTXO
6. Send .lock file to recipient

### 3. Recipient Unseals Vault
1. Decrypt metadata (proves they're the intended recipient)
2. Spend Challenge UTXO to their own address (claims the sats)
3. Extract `k` from the on-chain signature
4. Decrypt SEAL with `k`

## Security Model

**Cryptographic guarantees:**
- Only recipient can decrypt (requires their private key)
- Vault files can be public (all data is encrypted)
- No key escrow (decryption key extracted from blockchain)
- Forward secrecy (each vault uses unique `k`)

**Trust model:**
- No trusted third parties
- No server infrastructure
- No coordination required between sender and recipient

## Requirements

### For Senders
- Recipient's public key (from BIP-322 signature)
- Bitcoin wallet with Taproot support
- ~1000 sats for Challenge UTXO

### For Recipients
- Published BIP-322 signature (reveals public key)
- Bitcoin wallet with Taproot support
- Blockchain access (to broadcast transaction and extract signature)

### Technical
- Desktop or air-gapped wallets (browser wallets don't support adaptor signatures)
- WASM library for `adaptor_extract()`
- Taproot (P2TR) support
- PSBT support for air-gapped workflows

## Use Cases

- **Encrypted messaging** - Send messages only recipient can read
- **Secure file sharing** - Share files with cryptographic access control
- **Dead drops** - Leave encrypted data in public locations
- **Whistleblowing** - Anonymous encrypted submissions
- **Digital inheritance** - Encrypted data with Bitcoin-based access

## Documentation

- **[PROTOCOL.md](./PROTOCOL.md)** - Complete protocol overview and flow
- **[SPEC.md](./SPEC.md)** - Technical specification and algorithms

## Quick Start

### Recipient: Publish Your Identity

```bash
# Create BIP-322 signature of your address
bitcoin-cli signmessage "bc1q..." "LOCK-IDENTITY"

# Publish signature (Nostr, website, QR code, etc.)
```

### Sender: Create Vault

```javascript
import { createVault } from 'lock-protocol';

const vault = await createVault({
  recipient_pubkey: extractPubkeyFromBIP322(signature),
  payload: files,
  challenge_amount: 1000
});

// Send vault.lock file to recipient
```

### Recipient: Unseal Vault

```javascript
import { unsealVault } from 'lock-protocol';

const payload = await unsealVault({
  vault_file: 'vault.lock',
  recipient_privkey: privkey,
  wallet: bitcoinWallet
});
```

## Comparison to Alternatives

| Feature | LOCK | PGP | Signal | Nostr DMs |
|---------|------|-----|--------|-----------|
| Trustless | ✅ | ✅ | ❌ | ⚠️ |
| Public vaults | ✅ | ✅ | ❌ | ❌ |
| Bitcoin-enforced | ✅ | ❌ | ❌ | ❌ |
| No key exchange | ✅ | ❌ | ❌ | ❌ |
| Air-gapped | ✅ | ✅ | ❌ | ❌ |

## Future: Proof-of-Access (PoA)

The current protocol enforces that only the recipient can decrypt. Future versions may add cryptographically-enforced conditions:

- Amount requirements (must spend X sats)
- Time-locks (cannot unseal before block Y)
- Multi-recipient vaults
- Unlock limits

This is an open research problem requiring the decryption key to be bound to a separate PoA transaction.

## Status

**Version:** 1.0  
**Status:** Specification complete, implementation in progress

## License

MIT

## Contributing

LOCK is an open protocol. Implementations, improvements, and research contributions are welcome.

