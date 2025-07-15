import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { EndpointUsageTracker } from './tracker';
import { AutomaticReporter, ReportConfig } from './automatic-reporter';

@Injectable()
export class NestJSRouteDiscoveryService implements OnModuleInit {
	constructor(
		private readonly discovery: DiscoveryService,
		private readonly metadataScanner: MetadataScanner,
		private readonly reflector: Reflector,
		private readonly tracker: EndpointUsageTracker,
		private readonly reportConfig?: ReportConfig
	) { }

	async onModuleInit() {
		await this.discoverRoutes();

		if (this.reportConfig) {
			const reporter = new AutomaticReporter(this.tracker, this.reportConfig);
			reporter.start();
		}
	}

	private async discoverRoutes() {
		const controllers = this.discovery.getControllers();
		const routes: Array<{ method: string, path: string, controller: string, handler: string }> = [];

		for (const wrapper of controllers) {
			const { instance, metatype } = wrapper;

			if (!instance || !metatype) continue;

			const prototype = Object.getPrototypeOf(instance);
			const controllerPath = this.reflector.get('path', metatype) || '';

			const methodNames = this.metadataScanner.scanFromPrototype(
				instance,
				prototype,
				(name: string) => name
			);

			for (const methodName of methodNames) {
				const method = prototype[methodName];

				const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
				let httpMethod = '';
				let routePath = '';

				for (const verb of httpMethods) {
					const metadata = this.reflector.get(verb, method);
					if (metadata !== undefined) {
						httpMethod = verb.toUpperCase();
						routePath = typeof metadata === 'string' ? metadata : '';
						break;
					}
				}

				if (httpMethod) {
					const fullPath = this.normalizePath(controllerPath, routePath);

					routes.push({
						method: httpMethod,
						path: fullPath,
						controller: metatype.name,
						handler: methodName
					});

					await this.tracker.registerRoute(httpMethod, fullPath);
				}
			}
		}

		console.log(`NestJS: ${routes.length} route keşfedildi`);
		routes.forEach(route => {
			console.log(`  ${route.method} ${route.path} -> ${route.controller}.${route.handler}`);
		});

		return routes;
	}

	private normalizePath(controllerPath: string, routePath: string): string {
		const controller = controllerPath.startsWith('/') ? controllerPath : `/${controllerPath}`;
		const route = routePath.startsWith('/') ? routePath : `/${routePath}`;

		if (route === '/') {
			return controller === '/' ? '/' : controller;
		}

		return controller === '/' ? route : `${controller}${route}`;
	}
}

export const createNestJSRouteDiscoveryProviders = (reportConfig?: ReportConfig) => [
	{
		provide: NestJSRouteDiscoveryService,
		useClass: NestJSRouteDiscoveryService,
	},
	{
		provide: 'REPORT_CONFIG',
		useValue: reportConfig,
	},
];
