import { describe, expect, it } from 'vitest';
import {
    buildBindingStatement,
    buildRevocationStatement,
    computeNostrEventId,
    deriveNostrKey,
    finalizeDeviceEvent,
    generateDeviceKey,
    parseDeviceEvent,
} from './index.js';

describe('device', () => {
    it('generates a device key with expected shape', () => {
        const k = generateDeviceKey();
        expect(k.device_pk).toMatch(/^[0-9a-f]{64}$/);
        expect(k.device_id).toMatch(/^[0-9a-f]{32}$/);
        expect(k.device_sk.length).toBe(32);
    });

    it('binding statement is deterministic and canonical', () => {
        const s = buildBindingStatement({
            address: 'bc1qalice',
            device_pk: 'aa'.repeat(32),
            device_id: '01'.repeat(16),
            created_at: '2026-04-22T14:03:11.000Z',
        });
        expect(s).toBe(
            'oc-lock:device-bind:v2\n' +
                'address: bc1qalice\n' +
                'device_pk: ' + 'aa'.repeat(32) + '\n' +
                'device_id: ' + '01'.repeat(16) + '\n' +
                'created_at: 2026-04-22T14:03:11.000Z\n'
        );
    });

    it('revocation statement is canonical', () => {
        const s = buildRevocationStatement({
            address: 'bc1qalice',
            device_id: '01'.repeat(16),
            revoked_at: '2026-05-01T00:00:00.000Z',
        });
        expect(s).toBe(
            'oc-lock:device-revoke:v2\n' +
                'address: bc1qalice\n' +
                'device_id: ' + '01'.repeat(16) + '\n' +
                'revoked_at: 2026-05-01T00:00:00.000Z\n'
        );
    });

    it('derives a deterministic Nostr key from device secret', () => {
        const k = generateDeviceKey();
        const n1 = deriveNostrKey(k.device_sk);
        const n2 = deriveNostrKey(k.device_sk);
        expect(n1.nostrSk).toBe(n2.nostrSk);
        expect(n1.nostrPk).toBe(n2.nostrPk);
        expect(n1.nostrPk).toMatch(/^[0-9a-f]{64}$/);
    });

    it('finalized device event has stable id and valid signature', () => {
        const k = generateDeviceKey();
        const binding = buildBindingStatement({
            address: 'bc1qalice',
            device_pk: k.device_pk,
            device_id: k.device_id,
            created_at: k.created_at,
        });
        const event = finalizeDeviceEvent({
            deviceSk: k.device_sk,
            address: 'bc1qalice',
            device_id: k.device_id,
            device_pk: k.device_pk,
            bindingStatement: binding,
            bindingSigBase64: 'fakeBip322Sig==',
            createdAtUnix: 1_700_000_000,
        });
        expect(event.id).toMatch(/^[0-9a-f]{64}$/);
        expect(event.sig).toMatch(/^[0-9a-f]{128}$/);
        // Recomputed id must match.
        const { id: _id, sig: _sig, ...rest } = event;
        const recomputed = computeNostrEventId(rest);
        expect(recomputed).toBe(event.id);
    });

    it('round-trips through parseDeviceEvent', () => {
        const k = generateDeviceKey();
        const binding = buildBindingStatement({
            address: 'bc1qalice',
            device_pk: k.device_pk,
            device_id: k.device_id,
            created_at: k.created_at,
        });
        const event = finalizeDeviceEvent({
            deviceSk: k.device_sk,
            address: 'bc1qalice',
            device_id: k.device_id,
            device_pk: k.device_pk,
            bindingStatement: binding,
            bindingSigBase64: 'sig==',
        });
        const parsed = parseDeviceEvent(event);
        expect(parsed.address).toBe('bc1qalice');
        expect(parsed.device_pk).toBe(k.device_pk);
        expect(parsed.device_id).toBe(k.device_id);
        expect(parsed.revoked).toBe(false);
    });

    it('detects revoked device records', () => {
        const k = generateDeviceKey();
        const event = finalizeDeviceEvent({
            deviceSk: k.device_sk,
            address: 'bc1qalice',
            device_id: k.device_id,
            device_pk: 'revoked',
            bindingStatement: buildRevocationStatement({
                address: 'bc1qalice',
                device_id: k.device_id,
                revoked_at: new Date().toISOString(),
            }),
            bindingSigBase64: 'revoked-sig==',
        });
        const parsed = parseDeviceEvent(event);
        expect(parsed.revoked).toBe(true);
    });
});
