import { describe, expect, it } from 'vitest';
import {
	encodeBinaryFrame,
	decodeBinaryFrame,
	BIN_KIND_TERM,
	BIN_KIND_HTTP_BODY,
	isAgentToHubMessage,
	isHubToAgentMessage,
} from '../src/lib/agent-channel.js';

describe('agent-channel framing', () => {
	it('round-trips binary frames with string payloads', () => {
		const buf = encodeBinaryFrame(BIN_KIND_TERM, 42, 'hello \x1b[31mworld\x1b[0m');
		const frame = decodeBinaryFrame(buf)!;
		expect(frame.kind).toBe(BIN_KIND_TERM);
		expect(frame.id).toBe(42);
		expect(frame.payload.toString('utf-8')).toBe('hello \x1b[31mworld\x1b[0m');
	});

	it('round-trips binary frames with buffer payloads', () => {
		const payload = Buffer.from([0, 1, 2, 3, 255]);
		const frame = decodeBinaryFrame(encodeBinaryFrame(BIN_KIND_HTTP_BODY, 2 ** 32 - 1, payload))!;
		expect(frame.kind).toBe(BIN_KIND_HTTP_BODY);
		expect(frame.id).toBe(2 ** 32 - 1);
		expect(Buffer.compare(frame.payload, payload)).toBe(0);
	});

	it('rejects short buffers', () => {
		expect(decodeBinaryFrame(Buffer.from([1, 2]))).toBeNull();
	});

	it('handles large multi-byte ids', () => {
		const buf = encodeBinaryFrame(BIN_KIND_TERM, 300, 'x');
		const frame = decodeBinaryFrame(buf)!;
		expect(frame.id).toBe(300);
	});

	it('validates message types', () => {
		expect(isAgentToHubMessage({ type: 'sessions', sessions: [] })).toBe(true);
		expect(isAgentToHubMessage({ type: 'http_req' })).toBe(false); // hub→agent
		expect(isHubToAgentMessage({ type: 'attach', connId: 1, session: 's' })).toBe(true);
		expect(isHubToAgentMessage({ type: 'hello' })).toBe(false);
		expect(isAgentToHubMessage(null)).toBe(false);
		expect(isAgentToHubMessage({})).toBe(false);
	});
});
