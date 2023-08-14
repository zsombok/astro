import type { Params, RouteData } from '../../@types/astro.js';
import { joinPaths } from '../path.js';

interface CreateUrlOptions {
	params?: Params;
	site?: string;
	base?: string;
}

export function createRouteUrl(route: RouteData, options: CreateUrlOptions) {
	const site = options.site ?? 'http://localhost:4321';
	const base = options.base ?? '/';

	// Tests don't implement generate, do a dirty skip here
	if (route.generate == null) {
		return new URL(base, site);
	}

	const pathnameWithoutBase = route.generate(options.params);
	// If the pathname is empty (root without trailing slash), return it as is so the final
	// URL also doesn't have a trailing slash
	const pathname = pathnameWithoutBase === '' ? '' : joinPaths(base, pathnameWithoutBase);
	return new URL(pathname, site);
}
