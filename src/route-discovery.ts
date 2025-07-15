import { Application } from 'express';
import { EndpointUsageTracker } from './tracker';

export interface RouteInfo {
	method: string;
	path: string;
	middleware: string[];
	handler: string;
}

export interface RouteDiscoveryOptions {
	includeMiddleware?: boolean;
	excludePatterns?: RegExp[];
}

export class RouteDiscovery {
	private tracker: EndpointUsageTracker;
	private discoveredRoutes: Map<string, RouteInfo> = new Map();

	constructor(tracker: EndpointUsageTracker) {
		this.tracker = tracker;
	}

	/**
	 * Discovers and registers all routes from an Express.js application
	 */
	discoverExpressRoutes(app: Application, options: RouteDiscoveryOptions = {}): RouteInfo[] {
		const routes: RouteInfo[] = [];

		// Scan all routes in the Express app
		this.extractRoutesFromApp(app, routes, options);

		// Register discovered routes
		this.registerDiscoveredRoutes(routes);

		return routes;
	}

	private extractRoutesFromApp(app: Application, routes: RouteInfo[], options: RouteDiscoveryOptions): void {
		const { excludePatterns = [] } = options;

		// Inspect the router stack of the Express app
		if (app._router && app._router.stack) {
			this.processRouterStack(app._router.stack, routes, '', excludePatterns);
		}
	}

	private processRouterStack(stack: any[], routes: RouteInfo[], basePath: string, excludePatterns: RegExp[]): void {
		stack.forEach((layer: any) => {
			if (layer.route) {
				// Normal route
				const route = layer.route;
				const path = basePath + (route.path || '');

				// Check against exclude patterns
				if (excludePatterns.some(pattern => pattern.test(path))) {
					return;
				}

				Object.keys(route.methods).forEach(method => {
					if (route.methods[method]) {
						const routeInfo: RouteInfo = {
							method: method.toUpperCase(),
							path: path,
							middleware: this.extractMiddlewareNames(route.stack),
							handler: this.getFunctionName(route.stack[route.stack.length - 1]?.handle)
						};

						routes.push(routeInfo);
					}
				});
			} else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
				// Sub-router
				const routerPath = this.getRouterPath(layer);
				this.processRouterStack(layer.handle.stack, routes, basePath + routerPath, excludePatterns);
			}
		});
	}

	private getRouterPath(layer: any): string {
		if (layer.regexp && layer.regexp.source) {
			// Extract path from regex (simple case)
			const source = layer.regexp.source;
			const match = source.match(/^\^\\?(.*?)\\/);
			if (match && match[1]) {
				return '/' + match[1].replace(/\\\//g, '/');
			}
		}
		return '';
	}

	private extractMiddlewareNames(stack: any[]): string[] {
		if (!stack) return [];

		return stack.map(layer => this.getFunctionName(layer.handle)).filter(name => name !== 'anonymous');
	}

	private getFunctionName(fn: Function): string {
		if (!fn) return 'unknown';
		return fn.name || 'anonymous';
	}

	/**
	 * Register discovered routes with the tracker
	 */
	private async registerDiscoveredRoutes(routes: RouteInfo[]): Promise<void> {
		for (const route of routes) {
			const routeKey = `${route.method}:${route.path}`;
			this.discoveredRoutes.set(routeKey, route);

			// Register the route in Redis (first seen time)
			await this.tracker.registerRoute(route.method, route.path);
		}
	}

	/**
	 * Discovers NestJS controllers (using reflection)
	 */
	discoverNestJSRoutes(module: any): RouteInfo[] {
		const routes: RouteInfo[] = [];

		// This part will use NestJS's metadata system
		// Simple implementation for now

		return routes;
	}

	/**
	 * Returns all discovered routes
	 */
	getDiscoveredRoutes(): RouteInfo[] {
		return Array.from(this.discoveredRoutes.values());
	}

	/**
	 * Finds unused routes
	 */
	async findUnusedRoutes(daysThreshold: number = 30): Promise<RouteInfo[]> {
		const allStats = await this.tracker.getEndpointStats();
		const statsMap = new Map(allStats.map(stat => [`${stat.method}:${stat.path}`, stat]));

		const unusedRoutes: RouteInfo[] = [];
		const thresholdDate = new Date();
		thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

		for (const route of this.discoveredRoutes.values()) {
			const routeKey = `${route.method}:${route.path}`;
			const stats = statsMap.get(routeKey);

			if (!stats || stats.lastAccessed < thresholdDate) {
				unusedRoutes.push(route);
			}
		}

		return unusedRoutes;
	}

	/**
	 * Generates a route usage report
	 */
	async generateUsageReport(daysThreshold: number = 30): Promise<{
		total: number;
		used: number;
		unused: number;
		unusedRoutes: RouteInfo[];
		usageStats: any[];
	}> {
		const unusedRoutes = await this.findUnusedRoutes(daysThreshold);
		const allStats = await this.tracker.getEndpointStats();

		return {
			total: this.discoveredRoutes.size,
			used: this.discoveredRoutes.size - unusedRoutes.length,
			unused: unusedRoutes.length,
			unusedRoutes,
			usageStats: allStats
		};
	}
}
