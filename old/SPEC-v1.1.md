# LOCK Protocol v1.1 - Relay Release Variant

**Status:** Draft  
**Version:** 1.1.0  
**Date:** 2025-10-23

---

## 1. Overview

### 1.1 Purpose

LOCK Protocol v1.1 (relay-release) is a variant of LOCK v1.0 that enables Bitcoin-enforced encryption to work with **standard Bitcoin wallets** that do not support Taproot adaptor signatures.

This variant maintains the same cryptographic security properties as v1.0, with one key difference: the adaptor secret `k` is published by the sender to Nostr relays after PoA confirmation, rather than being extracted from an on-chain signature.

### 1.2 Relationship to v1.0

LOCK v1.1 is **not a replacement** for v1.0. Both variants are valid and can coexist:

- **v1.0 (Taproot Adaptor)**: Fully trustless, requires adaptor signature support
- **v1.1 (Relay Release)**: Requires sender cooperation, works with any wallet

The implementation automatically selects the appropriate variant based on wallet capabilities.

### 1.3 Key Differences from v1.0

| Aspect | v1.0 (Adaptor) | v1.1 (Relay Release) |
|--------|----------------|----------------------|
| **Wallet Support** | Requires adaptor signatures | Any wallet (signPsbt) |
| **Sender Action** | None (fully automated) | Background process publishes k |
| **Trust Model** | Trustless | Requires sender cooperation |
| **k Transmission** | Extracted from blockchain | Published to Nostr relays |
| **Privacy** | On-chain only | Nostr relays see vault activity |
| **Decryption Enforcement** | Cryptographic | Cryptographic (identical) |
| **PoA Requirement** | Enforced | Enforced (identical) |

### 1.4 Security Model

**What v1.1 DOES guarantee:**
- ✅ Recipient cannot decrypt without `k`
- ✅ `k` is not in vault file
- ✅ Final decryption key requires PoA merkle root
- ✅ Challenge UTXO spend proves address ownership
- ✅ Cryptographic binding to PoA transaction

**What v1.1 DOES NOT guarantee:**
- ❌ Sender cannot refuse to publish `k` (requires cooperation)
- ❌ Nostr relays cannot see vault activity (privacy trade-off)

**Acceptable use cases:**
- ✅ Messaging (sender wants recipient to read)
- ✅ File sharing (sender wants recipient to access)
- ✅ Collaborative workflows (mutual trust)

**Not recommended for:**
- ❌ Adversarial scenarios (use v1.0 instead)
- ❌ High-value escrow (use v1.0 instead)

---

## 2. Protocol Specification

### 2.1 Vault Structure

```typescript
interface VaultV11 {
  version: "lock-v1-taproot-adaptor";  // Same as v1.0
  vaultId: Uint8Array;                 // 32 bytes
  rules: {
    recipientAddress: string;          // P2TR address
    amount: number;                    // satoshis
    confirmations: number;             // min confirmations
    timeLock?: number;                 // optional block height
  };
  outputCommitment: Uint8Array;        // 32 bytes
  challengeUtxo: ChallengeUtxo;
  adaptor: {
    T_xonly: Uint8Array;               // 32 bytes (k·G)
    spendTemplate: Uint8Array;         // EMPTY (0 bytes) for v1.1
  };
  cipher: CipherData;
  keyRelease: {                        // NEW in v1.1
    method: "nostr-relay";
    relays: string[];                  // Nostr relay URLs
    eventKind?: number;                // Default: 21000
  };
  meta?: Record<string, unknown>;
}
```

**Key differences:**
- `adaptor.spendTemplate` is **empty** (0 bytes) in v1.1
- `keyRelease` field specifies Nostr relay configuration

### 2.2 SEAL Process (Sender)

**Steps 1-7:** Identical to v1.0 (generate vaultId, k, encrypt payload, etc.)

**Step 8:** Create vault structure with `keyRelease` config:
```typescript
vault.keyRelease = {
  method: "nostr-relay",
  relays: [
    "wss://relay.damus.io",
    "wss://relay.nostr.band",
    "wss://nos.lol",
    "wss://relay.snort.social"
  ]
};
```

**Step 9:** Store `k` in localStorage (NOT in vault file):
```typescript
const vaultIdHex = bytesToHex(vaultId);
const kHex = bytesToHex(k);
localStorage.setItem(`lock_k_${vaultIdHex}`, kHex);
```

**Step 10:** Register vault with AutomatedKeyPublisher:
```typescript
AutomatedKeyPublisher.registerVault(vault, k, network);
```

**Step 11:** Send vault file to recipient (vault does NOT contain `k`)

### 2.3 Automated Key Publishing (Sender Background Process)

The sender's client runs an **AutomatedKeyPublisher** service that:

1. **Monitors localStorage** for pending vaults
2. **Watches blockchain** for Challenge UTXO spend
3. **Waits for PoA** transaction with required confirmations
4. **Verifies PoA** output commitment matches vault rules
5. **Publishes `k`** to Nostr relays (kind 21000 event)
6. **Cleans up** localStorage after successful publish

**Nostr Event Format:**
```json
{
  "kind": 21000,
  "tags": [
    ["vault", "<vaultId_hex>"],
    ["protocol", "lock-v1.1-relay-release"]
  ],
  "content": "<k_hex>",
  "created_at": <unix_timestamp>,
  "pubkey": "<sender_pubkey_hex>",
  "id": "<event_id_hex>",
  "sig": "<schnorr_signature_hex>"
}
```

### 2.4 UNSEAL Process (Recipient)

**Steps 1-5:** Identical to v1.0 (validate PoA, verify confirmations, etc.)

**Step 6:** Fetch `k` from Nostr relays:
```typescript
const relays = vault.keyRelease?.relays || DEFAULT_LOCK_RELAYS;
const fetchResult = await fetchKeyFromNostr(vault.vaultId, relays);

if (!fetchResult.found || !fetchResult.k) {
  throw new Error("k not found - sender must publish after PoA");
}

k = fetchResult.k;
```

**Steps 7-10:** Identical to v1.0 (derive KEK, decrypt master key, decrypt payload)

---

## 3. Cryptographic Details

### 3.1 Encryption (Identical to v1.0)

```
masterKey = random(32 bytes)
payload_ciphertext = AES256GCM(payload, masterKey, nonce, AAD=vaultId||outputCommitment)

k = random_scalar()
T = k·G
KEK = HKDF(k, salt="LOCK-v1-bind", info=vaultId||outputCommitment)
masterKey_ciphertext = AES256GCM(masterKey, KEK, nonce, AAD=vaultId||outputCommitment)
```

### 3.2 Decryption (Identical to v1.0)

```
// k obtained from Nostr relay (v1.1) instead of on-chain extraction (v1.0)
KEK = HKDF(k, salt="LOCK-v1-bind", info=vaultId||outputCommitment)
masterKey = AES256GCM_decrypt(masterKey_ciphertext, KEK, ...)
payload = AES256GCM_decrypt(payload_ciphertext, masterKey, ...)
```

**The cryptographic binding is IDENTICAL to v1.0.**  
Only the method of transmitting `k` differs.

---

## 4. Implementation Notes

### 4.1 Dual-Mode Support

The implementation supports **both v1.0 and v1.1** in the same codebase:

```typescript
// seal.ts
const hasValidAdaptorTemplate = adaptorSpendTemplate?.length === 64;

if (hasValidAdaptorTemplate) {
  // v1.0 mode: Don't store k, use adaptor extraction
  vault.adaptor.spendTemplate = adaptorSpendTemplate;
} else {
  // v1.1 mode: Store k in localStorage, add keyRelease config
  localStorage.setItem(`lock_k_${vaultIdHex}`, kHex);
  vault.keyRelease = { method: "nostr-relay", relays: [...] };
}
```

### 4.2 AutomatedKeyPublisher Lifecycle

**Start on app initialization:**
```typescript
import { startGlobalPublisher } from '@/modules/lock/lib/publisher/AutomatedKeyPublisher';

// In app initialization
startGlobalPublisher();
```

**Runs in background:**
- Polls every 30 seconds
- Checks pending vaults in localStorage
- Publishes k when PoA confirmed
- Cleans up after successful publish

**Graceful degradation:**
- If sender's browser closes, k remains in localStorage
- On next app load, publisher resumes monitoring
- Multiple relays provide redundancy

### 4.3 Nostr Relay Selection

**Default relays:**
- `wss://relay.damus.io`
- `wss://relay.nostr.band`
- `wss://nos.lol`
- `wss://relay.snort.social`

**Customization:**
```typescript
const customRelays = ["wss://my-relay.com"];
vault.keyRelease = { method: "nostr-relay", relays: customRelays };
```

---

## 5. Migration Path

### 5.1 Current State (v1.1)

- ✅ Ships today with all wallets
- ✅ Works for messaging and file sharing
- ⚠️ Requires sender cooperation

### 5.2 Future State (v1.0)

When wallets add adaptor signature support:
- ✅ Upgrade to fully trustless mode
- ✅ No UX changes required
- ✅ Same vault structure
- ✅ Automatic mode detection

### 5.3 Coexistence

Both modes can coexist indefinitely:
- Air-gapped workflows use v1.0 (trustless)
- Standard wallets use v1.1 (cooperative)
- Implementation auto-detects based on `spendTemplate` presence

---

## 6. Security Considerations

### 6.1 Threat Model

**Sender cooperation required:**
- Sender must run AutomatedKeyPublisher
- Sender can refuse to publish `k`
- Acceptable for messaging (sender wants recipient to read)
- Not acceptable for adversarial escrow

**Nostr relay privacy:**
- Relays can see vault activity
- Relays cannot decrypt (don't have PoA merkle root)
- Use Tor or VPN for additional privacy

**PoA enforcement:**
- Cryptographically enforced (identical to v1.0)
- Sender verifies PoA before publishing `k`
- Recipient cannot decrypt without PoA

### 6.2 Comparison with v1.0

| Security Property | v1.0 | v1.1 |
|-------------------|------|------|
| Recipient can't decrypt without k | ✅ | ✅ |
| k not in vault file | ✅ | ✅ |
| PoA cryptographically enforced | ✅ | ✅ |
| Sender can't decrypt after seal | ✅ | ✅ (after publish) |
| Sender cooperation not required | ✅ | ❌ |
| Privacy from relays | ✅ | ❌ |

---

## 7. References

- [LOCK Protocol v1.0 Specification](./SPEC.md)
- [Nostr Protocol (NIP-01)](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [BIP-340: Schnorr Signatures](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki)
- [BIP-341: Taproot](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)

