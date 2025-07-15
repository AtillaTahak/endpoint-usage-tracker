export { EndpointUsageTracker } from './tracker';
export { createExpressMiddleware } from './express-middleware';
export { EndpointUsageInterceptor, EndpointUsageProvider } from './nestjs-interceptor';
export { RouteDiscovery } from './route-discovery';
export { AutomaticReporter } from './automatic-reporter';
export * from './types';

import { EndpointUsageTracker } from './tracker';
import { EndpointUsageConfig } from './types';
import { AutomaticReporter, ReportConfig } from './automatic-reporter';

export function createTracker(config: EndpointUsageConfig) {
	return new EndpointUsageTracker(config);
}

export function createAutomaticReporter(tracker: EndpointUsageTracker, config: ReportConfig) {
	return new AutomaticReporter(tracker, config);
}
