import * as devalue from 'devalue';
import * as cheerio from 'cheerio';
import assert from 'node:assert/strict';
import { describe, before, it } from 'node:test';
import { loadFixture } from './test-utils.js';
import testAdapter from './test-adapter.js';
import { preventNodeBuiltinDependencyPlugin } from './test-plugins.js';

describe('Content Collections', () => {
	describe('Query', () => {
		let fixture;
		before(async () => {
			fixture = await loadFixture({ root: './fixtures/content-collections/' });
			await fixture.build();
		});

		describe('Collection', () => {
			let json;
			before(async () => {
				const rawJson = await fixture.readFile('/collections.json');
				json = devalue.parse(rawJson);
			});

			it('Returns `without config` collection', async () => {
				assert.ok(json.hasOwnProperty('withoutConfig'));
				assert.equal(Array.isArray(json.withoutConfig), true);

				const ids = json.withoutConfig.map((item) => item.id);
				assert.deepEqual(ids, [
					'columbia.md',
					'endeavour.md',
					'enterprise.md',
					// Spaces allowed in IDs
					'promo/launch week.mdx',
				]);
			});

			it('Handles spaces in `without config` slugs', async () => {
				assert.ok(json.hasOwnProperty('withoutConfig'));
				assert.equal(Array.isArray(json.withoutConfig), true);

				const slugs = json.withoutConfig.map((item) => item.slug);
				assert.deepEqual(slugs, [
					'columbia',
					'endeavour',
					'enterprise',
					// "launch week.mdx" is converted to "launch-week.mdx"
					'promo/launch-week',
				]);
			});

			it('Returns `with schema` collection', async () => {
				assert.ok(json.hasOwnProperty('withSchemaConfig'));
				assert.equal(Array.isArray(json.withSchemaConfig), true);

				const ids = json.withSchemaConfig.map((item) => item.id);
				const publishedDates = json.withSchemaConfig.map((item) => item.data.publishedAt);
				assert.deepEqual(ids, ['four%.md', 'one.md', 'three.md', 'two.md']);
				assert.equal(
					publishedDates.every((date) => date instanceof Date),
					true,
					'Not all publishedAt dates are Date objects'
				);
				assert.deepEqual(
					publishedDates.map((date) => date.toISOString()),
					[
						'2021-01-01T00:00:00.000Z',
						'2021-01-01T00:00:00.000Z',
						'2021-01-03T00:00:00.000Z',
						'2021-01-02T00:00:00.000Z',
					]
				);
			});

			it('Returns `with custom slugs` collection', async () => {
				assert.ok(json.hasOwnProperty('withSlugConfig'));
				assert.equal(Array.isArray(json.withSlugConfig), true);

				const slugs = json.withSlugConfig.map((item) => item.slug);
				assert.deepEqual(slugs, ['fancy-one', 'excellent-three', 'interesting-two']);
			});

			it('Returns `with union schema` collection', async () => {
				assert.ok(json.hasOwnProperty('withUnionSchema'));
				assert.equal(Array.isArray(json.withUnionSchema), true);

				const post = json.withUnionSchema.find((item) => item.id === 'post.md');
				assert.notEqual(post, undefined);
				assert.deepEqual(post.data, {
					type: 'post',
					title: 'My Post',
					description: 'This is my post',
				});
				const newsletter = json.withUnionSchema.find((item) => item.id === 'newsletter.md');
				assert.notEqual(newsletter, undefined);
				assert.deepEqual(newsletter.data, {
					type: 'newsletter',
					subject: 'My Newsletter',
				});
			});
		});

		describe('Propagation', () => {
			it('Applies styles', async () => {
				const html = await fixture.readFile('/propagation/index.html');
				const $ = cheerio.load(html);
				assert.equal($('style').text().includes('content:"works!"'), true);
			});
		});

		describe('Entry', () => {
			let json;
			before(async () => {
				const rawJson = await fixture.readFile('/entries.json');
				json = devalue.parse(rawJson);
			});

			it('Returns `without config` collection entry', async () => {
				assert.ok(json.hasOwnProperty('columbiaWithoutConfig'));
				assert.equal(json.columbiaWithoutConfig.id, 'columbia.md');
			});

			it('Returns `with schema` collection entry', async () => {
				assert.ok(json.hasOwnProperty('oneWithSchemaConfig'));
				assert.equal(json.oneWithSchemaConfig.id, 'one.md');
				assert.equal(json.oneWithSchemaConfig.data.publishedAt instanceof Date, true);
				assert.equal(
					json.oneWithSchemaConfig.data.publishedAt.toISOString(),
					'2021-01-01T00:00:00.000Z'
				);
			});

			it('Returns `with custom slugs` collection entry', async () => {
				assert.ok(json.hasOwnProperty('twoWithSlugConfig'));
				assert.equal(json.twoWithSlugConfig.slug, 'interesting-two');
			});

			it('Returns `with union schema` collection entry', async () => {
				assert.ok(json.hasOwnProperty('postWithUnionSchema'));
				assert.equal(json.postWithUnionSchema.id, 'post.md');
				assert.deepEqual(json.postWithUnionSchema.data, {
					type: 'post',
					title: 'My Post',
					description: 'This is my post',
				});
			});
		});
	});

	const blogSlugToContents = {
		'first-post': {
			title: 'First post',
			element: 'blockquote',
			content: 'First post loaded: yes!',
		},
		'second-post': {
			title: 'Second post',
			element: 'blockquote',
			content: 'Second post loaded: yes!',
		},
		'third-post': {
			title: 'Third post',
			element: 'blockquote',
			content: 'Third post loaded: yes!',
		},
		'using-mdx': {
			title: 'Using MDX',
			element: 'a[href="#"]',
			content: 'Embedded component in MDX',
		},
	};

	describe('Static paths integration', () => {
		let fixture;

		before(async () => {
			fixture = await loadFixture({ root: './fixtures/content-static-paths-integration/' });
			await fixture.build();
		});

		it('Generates expected pages', async () => {
			for (const slug in blogSlugToContents) {
				assert.equal(fixture.pathExists(`/posts/${slug}`), true);
			}
		});

		it('Renders titles', async () => {
			for (const slug in blogSlugToContents) {
				const post = await fixture.readFile(`/posts/${slug}/index.html`);
				const $ = cheerio.load(post);
				assert.equal($('h1').text(), blogSlugToContents[slug].title);
			}
		});

		it('Renders content', async () => {
			for (const slug in blogSlugToContents) {
				const post = await fixture.readFile(`/posts/${slug}/index.html`);
				const $ = cheerio.load(post);
				assert.equal(
					$(blogSlugToContents[slug].element).text().trim(),
					blogSlugToContents[slug].content
				);
			}
		});
	});

	describe('With spaces in path', () => {
		it('Does not throw', async () => {
			const fixture = await loadFixture({ root: './fixtures/content with spaces in folder name/' });
			let error = null;
			try {
				await fixture.build();
			} catch (e) {
				error = e.message;
			}
			assert.equal(error, null);
		});
	});
	describe('With config.mjs', () => {
		it("Errors when frontmatter doesn't match schema", async () => {
			const fixture = await loadFixture({
				root: './fixtures/content-collections-with-config-mjs/',
			});
			let error;
			try {
				await fixture.build();
			} catch (e) {
				error = e.message;
			}
			assert.equal(error.includes('**title**: Expected type `"string"`, received "number"'), true);
		});
	});
	describe('With config.mts', () => {
		it("Errors when frontmatter doesn't match schema", async () => {
			const fixture = await loadFixture({
				root: './fixtures/content-collections-with-config-mts/',
			});
			let error;
			try {
				await fixture.build();
			} catch (e) {
				error = e.message;
			}
			assert.equal(error.includes('**title**: Expected type `"string"`, received "number"'), true);
		});
	});

	describe('With empty markdown file', () => {
		it('Throws the right error', async () => {
			const fixture = await loadFixture({
				root: './fixtures/content-collections-empty-md-file/',
			});
			let error;
			try {
				await fixture.build();
			} catch (e) {
				error = e.message;
			}
			assert.equal(error.includes('**title**: Required'), true);
		});
	});

	describe('With empty collections directory', () => {
		it('Handles the empty directory correclty', async () => {
			const fixture = await loadFixture({
				root: './fixtures/content-collections-empty-dir/',
			});
			let error;
			try {
				await fixture.build();
			} catch (e) {
				error = e.message;
			}
			assert.equal(error, undefined);
			// TODO: try to render a page
		});
	});

	describe('SSR integration', () => {
		let app;

		before(async () => {
			const fixture = await loadFixture({
				root: './fixtures/content-ssr-integration/',
				output: 'server',
				adapter: testAdapter(),
				vite: {
					plugins: [preventNodeBuiltinDependencyPlugin()],
				},
			});
			await fixture.build();
			app = await fixture.loadTestAdapterApp();
		});

		it('Responds 200 for expected pages', async () => {
			for (const slug in blogSlugToContents) {
				const request = new Request('http://example.com/posts/' + slug);
				const response = await app.render(request);
				assert.equal(response.status, 200);
			}
		});

		it('Renders titles', async () => {
			for (const slug in blogSlugToContents) {
				const request = new Request('http://example.com/posts/' + slug);
				const response = await app.render(request);
				const body = await response.text();
				const $ = cheerio.load(body);
				assert.equal($('h1').text(), blogSlugToContents[slug].title);
			}
		});

		it('Renders content', async () => {
			for (const slug in blogSlugToContents) {
				const request = new Request('http://example.com/posts/' + slug);
				const response = await app.render(request);
				const body = await response.text();
				const $ = cheerio.load(body);
				assert.equal(
					$(blogSlugToContents[slug].element).text().trim(),
					blogSlugToContents[slug].content
				);
			}
		});
	});

	describe('Base configuration', () => {
		let fixture;

		before(async () => {
			fixture = await loadFixture({
				root: './fixtures/content-collections-base/',
			});
			await fixture.build();
		});

		it('Includes base in links', async () => {
			const html = await fixture.readFile('/docs/index.html');
			const $ = cheerio.load(html);
			assert.equal($('link').attr('href').startsWith('/docs'), true);
		});

		it('Includes base in hoisted scripts', async () => {
			const html = await fixture.readFile('/docs/index.html');
			const $ = cheerio.load(html);
			assert.equal($('script').attr('src').startsWith('/docs'), true);
		});
	});
});
