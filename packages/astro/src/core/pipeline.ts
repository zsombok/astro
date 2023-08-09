import type { Environment } from './render/environment';
import {createRenderContext, type RenderContext, tryRenderRoute} from './render';
import type { EndpointCallResult } from './endpoint';
import type { ComponentInstance, MiddlewareEndpointHandler, RouteType } from '../@types/astro';
import { attachCookiesToResponse } from './cookies';
import { TextEncoder } from 'util';
import mime from 'mime';
import type {TransformResult} from "@astrojs/compiler";
import {createBasicEnvironment} from "../../test/units/test-utils";

/**
 * Questions:
 * 1. Can we call `getStaticPaths` really early?? Ideally when we load the component. -> idea is to make type the result of
 * `getStaticPaths`, so we can make serializable and stub it via JS (no need of compiler or make a module).
 * 2. When rendering a route, what are the info that belong to that route that are not shared with other routes? I guess:
 *  - the Request
 *  - a component instance?
 *  - styles?
 *  - scripts?
 *  - links?
 * 3. In `RenderContext` we have a route which is a `RouteData`. What's used for? and why it can be optional?
 */

/**
 * IDEAS:
 * - what if `handleRequest` dev, instead of directly rendering the page, returns only the info needed to render a route?
 * 		It would return only the `RenderContext`, because that's what needed for a route to render.
 */

type EndpointHandler = (
	originalRequest: Request,
	result: EndpointCallResult
) => Promise<Response> | Response;

export class Pipeline {
	env: Environment;
	onRequest?: MiddlewareEndpointHandler;
	endpointHandler?: EndpointHandler;

	constructor(env: Environment) {
		this.env = env;
	}

	setEndpointHandler(handler: EndpointHandler) {
		this.endpointHandler = handler;
	}

	setMiddlewareFunction(onRequest: MiddlewareEndpointHandler) {
		this.onRequest = onRequest;
	}

	async renderRoute(
		renderContext: RenderContext,
		componentInstance: ComponentInstance
	): Promise<Response> {
		const result = await tryRenderRoute(renderContext, this.env, componentInstance, this.onRequest);
		if (Pipeline.isEndpointResult(result, renderContext.route.type)) {
			if (!this.endpointHandler) {
				throw new Error('You must set the endpoint handler');
			}
			return this.endpointHandler(renderContext.request, result);
		} else {
			return result;
		}
	}

	static isEndpointResult(result: any, routeType: RouteType): result is EndpointCallResult {
		return !(result instanceof Response) && routeType === 'endpoint';
	}

	static isResponse(result: any, routeType: RouteType): result is Response {
		return result instanceof Response && (routeType === 'page' || routeType === 'redirect');
	}
}

class DevRoutePipeline extends Pipeline {
	clearRouteCache() {
		this.env.routeCache.clearAll();
	}
}

class BuildRoutePipeline extends Pipeline {
	
}

class TestRoutePipeline extends Pipeline {
	// NOTE: we can also store JSX renderers is we need?
	constructor() {
		super(createBasicEnvironment());
	}
	
	async renderAstroPage(contents: string) {
		const compilationResult = await this.#compile(contents);
		const renderContext = await this.#computeTestContext(compilationResult);
		const componentInstance = await this.#computeComponentInstance(compilationResult);
		const response = await super.renderRoute(renderContext, componentInstance);
		return response;
	}
	
	// TODO: compute `RenderContext` from compilation result, probably 
	async #computeTestContext(result: Readonly<TransformResult>): Promise<RenderContext> {
	}
	
	// TODO: compute `ComponentInstance` from compilation result, probably
	async #computeComponentInstance(result: Readonly<TransformResult>): Promise<ComponentInstance> {
		
	}
	
	async #compile(contents: string): Promise<TransformResult> {
		const compiler = await import("@astrojs/compiler");
		const result = await compiler.transform(contents);
		return result;
	}
}

// Example of testing


async function middleware_should_work() {
	const testPipeline = new TestRoutePipeline();
	const page = `
---
const title = Astro.locals.title;
---
<title>{title}</title>
	`;
	testPipeline.setMiddlewareFunction((context, next) => {
		context.locals = {
			title: "Test"
		}
		return next();
	})
	const result = await testPipeline.renderAstroPage(page);
	const text = await result.text();
	// assertion text contains "Test"
}


export class SSRRoutePipeline extends Pipeline {
	encoder = new TextEncoder();

	constructor(env: Environment) {
		super(env);
		this.setEndpointHandler(this.ssrEndpointHandler);
	}

	async ssrEndpointHandler(request: Request, response: EndpointCallResult): Promise<Response> {
		if (response.type === 'response') {
			if (response.response.headers.get('X-Astro-Response') === 'Not-Found') {
				// TODO: throw proper astro error to catch in the app/index.ts, and render a 404 instead
				throw new Error('');
			}
			return response.response;
		} else {
			const url = new URL(request.url);
			const headers = new Headers();
			const mimeType = mime.getType(url.pathname);
			if (mimeType) {
				headers.set('Content-Type', `${mimeType};charset=utf-8`);
			} else {
				headers.set('Content-Type', 'text/plain;charset=utf-8');
			}
			const bytes =
				response.encoding !== 'binary' ? this.encoder.encode(response.body) : response.body;
			headers.set('Content-Length', bytes.byteLength.toString());

			const newResponse = new Response(bytes, {
				status: 200,
				headers,
			});
			attachCookiesToResponse(newResponse, response.cookies);
			return newResponse;
		}
	}
}

