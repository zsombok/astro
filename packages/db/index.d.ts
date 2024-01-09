export type * from './dist/index.js';
export * from './dist/index.js';

declare namespace Config {
	type DatabaseUserConfig = import('./dist/config.js').DBUserConfig;
	export interface Database extends DatabaseUserConfig {}
}
