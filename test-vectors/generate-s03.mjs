#!/usr/bin/env node
/**
 * Device-binding vector s03 generator.
 *
 *   node test-vectors/generate-s03.mjs
 *
 * A reader checks a binding_sig as OC Attest SPEC §4 checks a signature
 * (SPEC §3.3): exactly 65 bytes is a legacy BIP-137 signature, which verifies
 * when the key it recovers derives the signed address, whatever its header's
 * address-type flag says. s03 holds the b01 bind and the r01 revocation
 * signed that way, over the statement and over it without its final LF, and
 * two BIP-137 signatures that do not verify: one by another key, one with a
 * header above 42.
 *
 * Signs BIP-137 with @noble/curves (deterministic, RFC 6979) and checks each
 * signature with @orangecheck/bip322, both resolved from an oc-packages
 * checkout next to this repository; set OC_SDK_NODE_MODULES to use another.
 * It first reproduces b01's binding_sig and the b01 and r01 event ids.
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_NODE_MODULES =
    process.env.OC_SDK_NODE_MODULES ?? join(__dirname, '..', '..', 'oc-packages', 'sdk', 'node_modules');
const require = createRequire(join(SDK_NODE_MODULES, '_.js'));
const { addressFromPrivateKey, signMessage, verifySignature } = require('@orangecheck/bip322');
const { secp256k1 } = require('@noble/curves/secp256k1.js');
const { base58 } = require('@scure/base');

const DIR = join(__dirname, 'device-binding');
const load = (name) => JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8'));
const b01 = load('b01-bind-v3');
const r01 = load('r01-revoke-k2');

const READER_TIME = '2026-11-22T00:00:00.000Z';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest();

// WIF: 0x80, the 32-byte key, 0x01 (compressed), then a 4-byte sha256d checksum.
const wif = base58.decode(b01.inputs.bitcoin_wif);
const body = wif.subarray(0, -4);
if (!sha256(sha256(body)).subarray(0, 4).equals(Buffer.from(wif.subarray(-4)))) throw new Error('WIF checksum');
if (body.length !== 34 || body[0] !== 0x80 || body[33] !== 0x01) throw new Error('not a compressed mainnet WIF');
const KEY = Buffer.from(body.subarray(1, 33)).toString('hex');
const ADDRESS = b01.inputs.address;
if (addressFromPrivateKey(KEY, 'p2wpkh') !== ADDRESS) throw new Error('the WIF is not the address key');
// OC Attest's disclosed burn key #2: a key whose address is not this one.
const OTHER_KEY = '0202020202020202020202020202020202020202020202020202020202020202';

// NIP-01: the id is the SHA-256 of [0, pubkey, created_at, kind, tags, content].
const eventId = (e) => sha256(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content])).toString('hex');

const BIND = b01.expected.statement;
const REVOCATION = r01.expected.revocation.statement;
if (signMessage(ADDRESS, BIND, KEY) !== b01.expected.binding_sig) throw new Error('b01 binding_sig does not reproduce');
if (eventId(b01.expected.event) !== b01.expected.event_id) throw new Error('b01 event id does not reproduce');
if (eventId(r01.expected.revocation.event) !== r01.expected.revocation.event_id) throw new Error('r01 event id');

// BIP-137: header (base + recovery id), then r and s, over the double SHA-256 of the
// "\x18Bitcoin Signed Message:\n" prefix, the text's CompactSize length and the text.
const bip137 = (text, key, base) => {
    const bytes = Buffer.from(text, 'utf8');
    if (bytes.length > 0xffff) throw new Error('text too long for a three-byte length');
    // CompactSize: one byte below 253, else 0xfd and two bytes little-endian.
    const size = bytes.length < 253 ? [bytes.length] : [0xfd, bytes.length & 0xff, bytes.length >> 8];
    const hash = sha256(sha256(Buffer.concat([Buffer.from('\u0018Bitcoin Signed Message:\n'), Buffer.from(size), bytes])));
    const recovered = secp256k1.sign(hash, Buffer.from(key, 'hex'), { prehash: false, format: 'recovered' });
    return Buffer.from([base + recovered[0], ...recovered.subarray(1)]).toString('base64');
};

const withSig = (tags, sig) => tags.map((t) => (t[0] === 'binding_sig' ? ['binding_sig', sig] : t));

/** A record whose content is `content` and whose binding_sig is `binding_sig` over `signed`. */
function record(description, template, keyField, content, signed, binding_sig) {
    const event = { ...template.event, content, tags: withSig(template.event.tags, binding_sig) };
    return { description, signed, binding_sig, ...keyField, event, event_id: eventId(event) };
}

const bindKey = { nostr_sk: b01.expected.nostr_sk };
const carrierKey = { carrier_nostr_sk: r01.inputs.carrier_nostr_sk };
const bind = (description, content, signed, key = KEY, base = 39) =>
    record(description, b01.expected, bindKey, content, signed, bip137(signed, key, base));

const accepted = {
    bind_bip137: bind(
        'The b01 bind with a BIP-137 binding_sig over its statement, header in the P2WPKH range. A reader accepts it (§3.3).',
        BIND,
        BIND
    ),
    bind_bip137_without_lf: bind(
        'The b01 bind written as the bytes its BIP-137 binding_sig covers, the statement without its final LF, with a header that names a compressed P2PKH key. A reader ignores the header’s address type (OC Attest SPEC §4) and accepts it.',
        BIND.slice(0, -1),
        BIND.slice(0, -1),
        KEY,
        31
    ),
    bind_bip137_signed_without_lf: bind(
        'The b01 bind with content that keeps the final LF and a BIP-137 binding_sig over the statement without it. A reader accepts it (§3.3).',
        BIND,
        BIND.slice(0, -1)
    ),
    revocation_bip137: record(
        'The r01 revocation, carried by the r01 carrier key, with a BIP-137 binding_sig over its statement. It retires the b01 bind (§3.3, §3.5).',
        r01.expected.revocation,
        carrierKey,
        REVOCATION,
        REVOCATION,
        bip137(REVOCATION, KEY, 39)
    ),
};
const rejected = {
    bind_bip137_other_key: bind(
        'The b01 bind with a BIP-137 binding_sig over its statement by another key: the key it recovers does not derive the address.',
        BIND,
        BIND,
        OTHER_KEY
    ),
    bind_bip137_header_43: bind(
        'The b01 bind with a BIP-137 binding_sig over its statement whose header is 43, above BIP-137’s 27 to 42.',
        BIND,
        BIND,
        KEY,
        43
    ),
};

// Each binding_sig is 65 bytes. An accepted one verifies over its signed text, which is
// its content or its content without the final LF; a rejected one verifies over neither.
for (const [name, r] of Object.entries({ ...accepted, ...rejected })) {
    if (Buffer.from(r.binding_sig, 'base64').length !== 65) throw new Error(`${name}: not 65 bytes`);
    const content = r.event.content;
    const texts = content.endsWith('\n') ? [content, content.slice(0, -1)] : [content];
    if (!texts.includes(r.signed)) throw new Error(`${name}: signs neither its content nor that without its LF`);
    if (texts.some((t) => verifySignature(ADDRESS, t, r.binding_sig)) !== name in accepted) {
        throw new Error(`${name}: verifies ${!(name in accepted)}`);
    }
}

const names = {
    b01: `expected.b01.event (b01-bind-v3.json expected.event), id ${b01.expected.event_id}`,
    ...Object.fromEntries(Object.entries(accepted).map(([n, r]) => [n, `expected.${n}.event, id ${r.event_id}`])),
    ...Object.fromEntries(Object.entries(rejected).map(([n, r]) => [n, `reject.${n}.event, id ${r.event_id}`])),
};

const vector = {
    description:
        'Device records whose binding_sig is a legacy BIP-137 signature (SPEC §3.3, OC Attest SPEC §4): 65 bytes, which verify when the key they recover derives the signed address, whatever the header’s address-type flag says. The b01 bind and the r01 revocation signed that way are accepted, over the statement or over it without its final LF, and the revocation retires the bind. A BIP-137 signature by another key, or with a header above 42, does not verify. The address and key are BIP-322’s own published test vector key (P2WPKH, mainnet); never use them for anything real.',
    inputs: {
        address: ADDRESS,
        bitcoin_wif: b01.inputs.bitcoin_wif,
        device_id: b01.inputs.device_id,
        reader_time: READER_TIME,
    },
    expected: {
        b01: { event: b01.expected.event, event_id: b01.expected.event_id },
        ...accepted,
        live: {
            description:
                'Each case is the union of the records a reader received for the address, judged at inputs.reader_time. live lists the binds a sender may seal to.',
            cases: [
                { records: ['bind_bip137'], live: ['bind_bip137'] },
                { records: ['bind_bip137_without_lf'], live: ['bind_bip137_without_lf'] },
                { records: ['bind_bip137_signed_without_lf'], live: ['bind_bip137_signed_without_lf'] },
                { records: ['b01', 'revocation_bip137'], live: [] },
                { records: ['bind_bip137_other_key'], live: [] },
                { records: ['bind_bip137_header_43'], live: [] },
            ],
            names,
        },
    },
    reject: rejected,
};

writeFileSync(join(DIR, 's03-bip137-binding-sig.json'), `${JSON.stringify(vector, null, 2)}\n`);
console.log('wrote device-binding/s03-bip137-binding-sig.json');
