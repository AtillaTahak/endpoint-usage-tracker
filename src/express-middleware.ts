import { Request, Response, NextFunction } from 'express';
import { EndpointUsageTracker } from './tracker';

export interface ExpressMiddlewareConfig {
	tracker: EndpointUsageTracker;
	includeUserAgent?: boolean;
	includeIP?: boolean;
	trackResponseTime?: boolean;
}

export function createExpressMiddleware(config: ExpressMiddlewareConfig) {
	return (req: Request, res: Response, next: NextFunction) => {
		const startTime = Date.now();

		res.on('finish', () => {
			const responseTime = Date.now() - startTime;

			config.tracker.trackUsage({
				method: req.method,
				path: req.route?.path || req.path,
				statusCode: res.statusCode,
				responseTime,
				userAgent: config.includeUserAgent ? req.get('User-Agent') : undefined,
				ip: config.includeIP ? req.ip : undefined,
				memoryUsage: process.memoryUsage().heapUsed,
				cpuUsage: process.cpuUsage().user,
			});
		});

		next();
	};
}
