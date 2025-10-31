# LOCK Protocol Technical Specification

## 1. Cryptographic Primitives

### 1.1 ECDH (Elliptic Curve Diffie-Hellman)

**Curve:** secp256k1 (Bitcoin's elliptic curve)

**Shared Secret Derivation:**
```
shared_secret = ECDH(privkey_a, pubkey_b)
              = privkey_a * pubkey_b
```

**Implementation:** Use `@noble/secp256k1` or equivalent

### 1.2 HKDF-SHA256 (Key Derivation)

**Purpose:** Derive encryption keys from shared secrets

**Parameters:**
- **IKM (Input Key Material):** `shared_secret || seal_hash`
- **Salt:** `"LOCK-METADATA"` (UTF-8 encoded)
- **Info:** `"metadata-v1"` (UTF-8 encoded)
- **Output length:** 32 bytes

**Formula:**
```
metadata_key = HKDF-SHA256(
  ikm = shared_secret || seal_hash,
  salt = "LOCK-METADATA",
  info = "metadata-v1",
  length = 32
)
```

### 1.3 AES-256-GCM (Authenticated Encryption)

**Algorithm:** AES-256 in Galois/Counter Mode

**Parameters:**
- **Key size:** 256 bits (32 bytes)
- **Nonce size:** 96 bits (12 bytes) - randomly generated
- **Tag size:** 128 bits (16 bytes)

**Usage:**
- Encrypt SEAL with secret `k`
- Encrypt metadata with derived `metadata_key`

### 1.4 Adaptor Signatures

**Type:** Schnorr adaptor signatures (BIP-340 variant)

**Components:**
- **Secret:** `k` (32 bytes, random)
- **Adaptor point:** `K = k * G`
- **Adaptor signature:** Commits to `k` without revealing it
- **Final signature:** Reveals `k` when completed on-chain

**Extraction:**
```
k = adaptor_extract(final_signature, adaptor_template)
```

**Implementation:** Requires WASM library

## 2. Vault Creation (SEAL)

### 2.1 Inputs

- Recipient's public key (from BIP-322 signature)
- Payload to encrypt (files, messages, etc.)
- Bitcoin wallet with Taproot support
- ~1000 sats for Challenge UTXO

### 2.2 Algorithm

**Step 1: Generate secret**
```javascript
const k = randomBytes(32);
```

**Step 2: Encrypt SEAL**
```javascript
const seal_nonce = randomBytes(12);
const { ciphertext, tag } = aes256gcm.encrypt(payload, k, seal_nonce);
const seal_hash = sha256(ciphertext || tag);
```

**Step 3: Derive metadata key**
```javascript
const shared_secret = ecdh(sender_privkey, recipient_pubkey);
const metadata_key = hkdf_sha256(
  shared_secret || seal_hash,
  "LOCK-METADATA",
  "metadata-v1",
  32
);
```

**Step 4: Encrypt metadata**
```javascript
const metadata = {
  sender_pubkey: hex(sender_pubkey),
  recipient_pubkey: hex(recipient_pubkey),
  created_at: timestamp,
  seal_hash: hex(seal_hash),
  description: "..."
};

const metadata_nonce = randomBytes(12);
const { ciphertext: meta_ct, tag: meta_tag } = aes256gcm.encrypt(
  JSON.stringify(metadata),
  metadata_key,
  metadata_nonce
);
```

**Step 5: Create Challenge UTXO**
```javascript
const challenge_privkey = randomBytes(32);
const challenge_pubkey = getPublicKey(challenge_privkey);
const challenge_address = createTaprootAddress(challenge_pubkey);

const tx = createTransaction({
  outputs: [{ address: challenge_address, amount: 1000 }]
});
const challenge_txid = broadcast(tx);
```

**Step 6: Create adaptor signature**
```javascript
const adaptor_sig = createAdaptorSignature({
  privkey: challenge_privkey,
  secret: k,
  recipient_pubkey: recipient_pubkey,
  utxo: { txid: challenge_txid, vout: 0 }
});
```

**Step 7: Assemble vault**
```javascript
const vault = {
  version: 1,
  seal: {
    ciphertext: base64(ciphertext),
    nonce: base64(seal_nonce),
    tag: base64(tag)
  },
  metadata: {
    ciphertext: base64(meta_ct),
    nonce: base64(metadata_nonce),
    tag: base64(meta_tag)
  },
  challenge: {
    txid: challenge_txid,
    vout: 0,
    amount: 1000,
    address: challenge_address
  },
  adaptor: {
    template: base64(adaptor_sig),
    pubkey: hex(challenge_pubkey)
  }
};
```

## 3. Vault Unsealing

### 3.1 Inputs

- .lock vault file
- Recipient's private key
- Bitcoin wallet with Taproot support
- Blockchain access

### 3.2 Algorithm

**Step 1: Decrypt metadata**
```javascript
const vault = JSON.parse(readFile("vault.lock"));

const seal_bytes = base64_decode(vault.seal.ciphertext) || base64_decode(vault.seal.tag);
const seal_hash = sha256(seal_bytes);

const shared_secret = ecdh(recipient_privkey, sender_pubkey);
const metadata_key = hkdf_sha256(
  shared_secret || seal_hash,
  "LOCK-METADATA",
  "metadata-v1",
  32
);

const metadata = JSON.parse(
  aes256gcm.decrypt(
    base64_decode(vault.metadata.ciphertext),
    metadata_key,
    base64_decode(vault.metadata.nonce),
    base64_decode(vault.metadata.tag)
  )
);
```

**Step 2: Spend Challenge UTXO**
```javascript
const spend_tx = createTransaction({
  inputs: [{
    txid: vault.challenge.txid,
    vout: vault.challenge.vout
  }],
  outputs: [{
    address: recipient_address,
    amount: vault.challenge.amount - fee
  }]
});

const final_sig = completeAdaptorSignature({
  adaptor_template: base64_decode(vault.adaptor.template),
  recipient_privkey: recipient_privkey,
  tx: spend_tx
});

spend_tx.witness = [final_sig, vault.adaptor.pubkey];
const spend_txid = broadcast(spend_tx);
waitForConfirmation(spend_txid);
```

**Step 3: Extract k**
```javascript
const confirmed_tx = getTransaction(spend_txid);
const final_signature = confirmed_tx.witness[0];

const k = adaptor_extract(
  final_signature,
  base64_decode(vault.adaptor.template)
);
```

**Step 4: Decrypt SEAL**
```javascript
const payload = aes256gcm.decrypt(
  base64_decode(vault.seal.ciphertext),
  k,
  base64_decode(vault.seal.nonce),
  base64_decode(vault.seal.tag)
);
```

## 4. Vault File Format

### 4.1 Structure

```json
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
    "txid": "<64-char hex>",
    "vout": 0,
    "amount": 1000,
    "address": "<bc1p...>"
  },
  "adaptor": {
    "template": "<base64>",
    "pubkey": "<66-char hex>"
  }
}
```

### 4.2 Metadata Schema (Decrypted)

```json
{
  "sender_pubkey": "<hex>",
  "recipient_pubkey": "<hex>",
  "created_at": 1234567890,
  "seal_hash": "<hex>",
  "description": "Optional description",
  "file_count": 3,
  "total_size": 1048576
}
```

## 5. Security Requirements

### 5.1 Randomness

- All nonces MUST be cryptographically random
- Secret `k` MUST use secure random source
- Never reuse nonces

### 5.2 Key Management

- Private keys MUST never be transmitted
- Clear shared secrets from memory after use
- Derive metadata keys fresh for each vault

### 5.3 Transaction Validation

- Challenge UTXO MUST be confirmed before extracting `k`
- Verify transaction is not RBF-enabled
- Validate adaptor signature before broadcasting

### 5.4 Implementation

- Use constant-time operations
- Validate all inputs
- Clear sensitive data from memory
- Use authenticated encryption (GCM)

## 6. Constants

```javascript
const LOCK_VERSION = 1;
const HKDF_SALT = "LOCK-METADATA";
const HKDF_INFO = "metadata-v1";
const AES_KEY_SIZE = 32; // bytes
const AES_NONCE_SIZE = 12; // bytes
const AES_TAG_SIZE = 16; // bytes
const ADAPTOR_SECRET_SIZE = 32; // bytes
const DEFAULT_CHALLENGE_AMOUNT = 1000; // sats
```

