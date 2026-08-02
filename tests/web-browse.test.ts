import { describe, expect, it } from 'vitest';
import { rewriteHtml } from '../src/lib/web-browse.js';

const TAB = 'tab1';
const BASE = 'https://example.com/path/article';

describe('rewriteHtml', () => {
	it('extracts the title', () => {
		const { title } = rewriteHtml('<html><head><title> Hello &amp; World </title></head></html>', BASE, TAB);
		expect(title).toBe('Hello & World');
	});

	it('rewrites relative and absolute navigation links', () => {
		const { html } = rewriteHtml(
			'<a href="/other">rel</a> <a href="https://other.com/x">abs</a> <a href="#frag">frag</a>',
			BASE,
			TAB,
		);
		expect(html).toContain(`/api/browse?url=${encodeURIComponent('https://example.com/other')}&amp;tab=${TAB}`);
		expect(html).toContain(`/api/browse?url=${encodeURIComponent('https://other.com/x')}&amp;tab=${TAB}`);
		expect(html).toContain('href="#frag"');
	});

	it('drops javascript: and data: links entirely', () => {
		const { html } = rewriteHtml('<a href="javascript:alert(1)">x</a>', BASE, TAB);
		expect(html).not.toContain('javascript:');
		expect(html).toContain('>x</a>');
	});

	it('keeps mailto/tel hrefs untouched', () => {
		const { html } = rewriteHtml('<a href="mailto:a@b.c">m</a><a href="tel:+123">t</a>', BASE, TAB);
		expect(html).toContain('href="mailto:a@b.c"');
		expect(html).toContain('href="tel:+123"');
	});

	it('rewrites subresource URLs to the asset proxy', () => {
		const { html } = rewriteHtml(
			'<img src="img.png" srcset="a.png 1x, b.png 2x"><link rel="stylesheet" href="s.css"><video src="v.mp4"></video>',
			BASE,
			TAB,
		);
		const assetBase = `/api/browse/asset?url=${encodeURIComponent('https://example.com/path/')}`;
		expect(html).toContain(assetBase + encodeURIComponent('img.png') + `&amp;tab=${TAB}`);
		expect(html).toContain('srcset="' + assetBase + encodeURIComponent('a.png') + `&amp;tab=${TAB} 1x, ` + assetBase + encodeURIComponent('b.png') + `&amp;tab=${TAB} 2x"`);
		expect(html).toContain(assetBase + encodeURIComponent('s.css') + `&amp;tab=${TAB}`);
	});

	it('rewrites css url() in style blocks and inline styles', () => {
		const { html } = rewriteHtml(
			'<style>.a{background:url(bg.png)}</style><div style="background:url(\'x/y.png\')"></div>',
			BASE,
			TAB,
		);
		expect(html).toContain('url(' + `/api/browse/asset?url=${encodeURIComponent('https://example.com/path/bg.png')}&tab=${TAB}` + ')');
		expect(html).toContain(`/api/browse/asset?url=${encodeURIComponent('https://example.com/path/x/y.png')}&amp;tab=${TAB}`);
	});

	it('strips script bodies, iframes, base, on* attributes and meta refresh', () => {
		const input =
			'<script>alert(1)</script>' +
			'<base href="https://evil.example/">' +
			'<iframe src="https://evil.example/"></iframe>' +
			'<meta http-equiv="refresh" content="0;url=https://evil.example/">' +
			'<button onclick="alert(1)">x</button>';
		const { html } = rewriteHtml(input, BASE, TAB);
		expect(html).not.toContain('alert(1)');
		expect(html).not.toContain('<base');
		expect(html).not.toContain('<iframe');
		expect(html).not.toContain('http-equiv');
		expect(html).not.toContain('onclick');
		expect(html).toContain('<button>x</button>');
	});

	it('rewrites forms to the submit proxy with hidden fields', () => {
		const { html } = rewriteHtml(
			'<form action="/search" method="post"><input name="q" value="1"></form>',
			BASE,
			TAB,
		);
		expect(html).toContain(`action="/api/browse/submit?tab=${TAB}"`);
		expect(html).toContain(`<input type="hidden" name="__browse_action" value="https://example.com/search">`);
		expect(html).toContain('<input type="hidden" name="__browse_method" value="post">');
	});

	it('preserves inline styles and text content', () => {
		const { html } = rewriteHtml('<h1 style="color:red">Hello</h1><p>World &amp; more</p>', BASE, TAB);
		expect(html).toContain('<h1 style="color:red">Hello</h1>');
		expect(html).toContain('<p>World &amp; more</p>');
	});

	it('rewrites style attributes but preserves inline text styles', () => {
		const { html } = rewriteHtml('<p style="color:red;background:url(a.png)">hi</p>', BASE, TAB);
		expect(html).toContain('color:red');
		expect(html).toContain(`/api/browse/asset?url=${encodeURIComponent('https://example.com/path/a.png')}&amp;tab=${TAB}`);
	});
});
