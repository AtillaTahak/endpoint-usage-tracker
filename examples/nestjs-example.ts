// NestJS Example
// This file demonstrates how to use the package in a NestJS project
// by creating a dedicated, global, and reusable module.

/*
// =================================================================
// 1. Create a dedicated module for the tracker (e.g., core/tracker.module.ts)
// =================================================================

import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
	EndpointUsageTracker,
	EndpointUsageInterceptor,
	createTracker,
	EndpointUsageConfig,
} from 'endpoint-usage-tracker';

@Global() // <-- Makes this module's providers available everywhere
@Module({
	providers: [
		// Configuration provider
		{
			provide: 'ENDPOINT_USAGE_CONFIG',
			useValue: {
				redis: { host: 'localhost', port: 6379 },
				keyPrefix: 'nestjs_app_usage',
				performanceTracking: {
					enabled: true,
					slowThresholdMs: 1000,
				},
			},
		},

		// Tracker provider, using the class as the token
		{
			provide: EndpointUsageTracker,
			useFactory: (config: EndpointUsageConfig) => {
				const tracker = createTracker(config);
				tracker.connect();
				return tracker;
			},
			inject: ['ENDPOINT_USAGE_CONFIG'],
		},

		// Interceptor provider, using a factory to inject the tracker
		{
			provide: APP_INTERCEPTOR,
			useFactory: (tracker: EndpointUsageTracker) => {
				return new EndpointUsageInterceptor({ tracker });
			},
			inject: [EndpointUsageTracker],
		},
	],
	// Export the tracker to be injectable in other modules
	exports: [EndpointUsageTracker],
})
export class TrackerModule {}


// =================================================================
// 2. Import the TrackerModule into your main AppModule (app.module.ts)
// =================================================================

import { Module } from '@nestjs/common';
import { TrackerModule } from './core/tracker.module'; // Adjust path as needed
import { UsersModule } from './users/users.module';

@Module({
	imports: [
		TrackerModule, // <-- Import the global module here
		UsersModule,
		// ... your other modules
	],
})
export class AppModule {}


// =================================================================
// 3. Inject and use the tracker in any controller (e.g., users.controller.ts)
// =================================================================

import { Controller, Get, Param } from '@nestjs/common';
import { EndpointUsageTracker } from 'endpoint-usage-tracker';

@Controller('users')
export class UsersController {
	constructor(
		// No more @Inject() decorator needed, NestJS resolves by type
		private readonly tracker: EndpointUsageTracker,
	) {}

	@Get()
	async getUsers() {
		return { users: ['alice', 'bob', 'charlie'] };
	}

	@Get(':id')
	async getUser(@Param('id') id: string) {
		return { user: { id, name: 'Sample User' } };
	}

	@Get('stats/dashboard')
	async getDashboard() {
		// You can now easily access tracker methods
		return this.tracker.getDashboardData(30);
	}
}
*/

export const nestjsExample = `
Follow the code examples above for NestJS integration.
1. Create a dedicated, global TrackerModule.
2. Import TrackerModule into your main AppModule.
3. Inject the EndpointUsageTracker service directly into your controllers by its type.
`;
