import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { EndpointUsageTracker } from './tracker';

@Injectable()
export class EndpointUsageInterceptor implements NestInterceptor {
	constructor(
		private readonly tracker: EndpointUsageTracker,
		private readonly options: {
			includeUserAgent?: boolean;
			includeIP?: boolean;
			trackResponseTime?: boolean;
		} = {}
	) { }

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const { includeUserAgent = true, includeIP = true, trackResponseTime = true } = this.options;
		const startTime = trackResponseTime ? Date.now() : undefined;

		const request = context.switchToHttp().getRequest();
		const response = context.switchToHttp().getResponse();

		return next.handle().pipe(
			tap({
				next: () => {
					this.trackUsage(request, response, startTime, { includeUserAgent, includeIP });
				},
				error: () => {
					this.trackUsage(request, response, startTime, { includeUserAgent, includeIP });
				}
			})
		);
	}

	private async trackUsage(
		request: any,
		response: any,
		startTime: number | undefined,
		options: { includeUserAgent: boolean; includeIP: boolean }
	): Promise<void> {
		try {
			const responseTime = startTime ? Date.now() - startTime : undefined;

			await this.tracker.trackUsage({
				method: request.method,
				path: request.route?.path || request.url,
				statusCode: response.statusCode,
				responseTime,
				userAgent: options.includeUserAgent ? request.get('User-Agent') : undefined,
				ip: options.includeIP ? (request.ip || request.connection?.remoteAddress) : undefined,
			});
		} catch (err) {
			console.error('Failed to track endpoint usage:', err);
		}
	}
}

export const EndpointUsageProvider = {
	provide: 'ENDPOINT_USAGE_TRACKER',
	useFactory: (config: any) => {
		return new EndpointUsageTracker(config);
	},
	inject: ['ENDPOINT_USAGE_CONFIG'],
};
