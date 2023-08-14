import type {
	APIContext,
	EndpointHandler,
	EndpointOutput,
	MiddlewareEndpointHandler,
	MiddlewareHandler,
	Params,
} from '../../@types/astro';
import type { Environment, RenderContext } from '../render/index';
import { renderEndpoint } from '../../runtime/server/index.js';
import { ASTRO_VERSION } from '../constants.js';
import { AstroCookies, attachCookiesToResponse } from '../cookies/index.js';
import { AstroError, AstroErrorData } from '../errors/index.js';
import { warn } from '../logger/core.js';
import { callMiddleware } from '../middleware/callMiddleware.js';
import { createRouteUrl } from '../routing/url.js';

const clientAddressSymbol = Symbol.for('astro.clientAddress');
const clientLocalsSymbol = Symbol.for('astro.locals');

export type EndpointCallResult =
	| (EndpointOutput & {
			type: 'simple';
			cookies: AstroCookies;
	  })
	| {
			type: 'response';
			response: Response;
	  };

type CreateAPIContext = {
	request: Request;
	params: Params;
	site?: string;
	routeUrl: URL;
	props: Record<string, any>;
	adapterName?: string;
};

/**
 * Creates a context that holds all the information needed to handle an Astro endpoint.
 *
 * @param {CreateAPIContext} payload
 */
export function createAPIContext({
	request,
	params,
	site,
	routeUrl,
	props,
	adapterName,
}: CreateAPIContext): APIContext {
	const context = {
		cookies: new AstroCookies(request),
		request,
		params,
		site: site ? new URL(site) : undefined,
		generator: `Astro v${ASTRO_VERSION}`,
		props,
		redirect(path, status) {
			return new Response(null, {
				status: status || 302,
				headers: {
					Location: path,
				},
			});
		},
		url: routeUrl,
		get clientAddress() {
			if (!(clientAddressSymbol in request)) {
				if (adapterName) {
					throw new AstroError({
						...AstroErrorData.ClientAddressNotAvailable,
						message: AstroErrorData.ClientAddressNotAvailable.message(adapterName),
					});
				} else {
					throw new AstroError(AstroErrorData.StaticClientAddressNotAvailable);
				}
			}

			return Reflect.get(request, clientAddressSymbol);
		},
	} as APIContext;

	// We define a custom property, so we can check the value passed to locals
	Object.defineProperty(context, 'locals', {
		enumerable: true,
		get() {
			return Reflect.get(request, clientLocalsSymbol);
		},
		set(val) {
			if (typeof val !== 'object') {
				throw new AstroError(AstroErrorData.LocalsNotAnObject);
			} else {
				Reflect.set(request, clientLocalsSymbol, val);
			}
		},
	});
	return context;
}

export async function callEndpoint<MiddlewareResult = Response | EndpointOutput>(
	mod: EndpointHandler,
	env: Environment,
	ctx: RenderContext,
	onRequest?: MiddlewareHandler<MiddlewareResult> | undefined
): Promise<EndpointCallResult> {
	const routeUrl = createRouteUrl(ctx.route, {
		params: ctx.params,
		base: env.base,
		site: env.site ?? new URL(ctx.request.url).origin,
	});

	const context = createAPIContext({
		request: ctx.request,
		params: ctx.params,
		props: ctx.props,
		site: env.site,
		routeUrl,
		adapterName: env.adapterName,
	});

	let response;
	if (onRequest) {
		response = await callMiddleware<Response | EndpointOutput>(
			env.logging,
			onRequest as MiddlewareEndpointHandler,
			context,
			async () => {
				return await renderEndpoint(mod, context, env.ssr, env.logging);
			}
		);
	} else {
		response = await renderEndpoint(mod, context, env.ssr, env.logging);
	}

	if (response instanceof Response) {
		attachCookiesToResponse(response, context.cookies);
		return {
			type: 'response',
			response,
		};
	}

	if (env.ssr && !ctx.route?.prerender) {
		if (response.hasOwnProperty('headers')) {
			warn(
				env.logging,
				'ssr',
				'Setting headers is not supported when returning an object. Please return an instance of Response. See https://docs.astro.build/en/core-concepts/endpoints/#server-endpoints-api-routes for more information.'
			);
		}

		if (response.encoding) {
			warn(
				env.logging,
				'ssr',
				'`encoding` is ignored in SSR. To return a charset other than UTF-8, please return an instance of Response. See https://docs.astro.build/en/core-concepts/endpoints/#server-endpoints-api-routes for more information.'
			);
		}
	}

	return {
		...response,
		type: 'simple',
		cookies: context.cookies,
	};
}
