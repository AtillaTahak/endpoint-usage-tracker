import { Redis } from 'ioredis';
import { EndpointUsageConfig, EndpointStats, UsageData, DashboardData, PerformanceMetrics } from './types';

export class EndpointUsageTracker {
	private redis: Redis;
	private config: EndpointUsageConfig & {
		performanceTracking: {
			enabled: boolean;
			slowThresholdMs: number;
			percentiles: number[];
			memoryTracking?: boolean;
			cpuTracking?: boolean;
		};
	};

	constructor(config: EndpointUsageConfig) {
		// Merge config correctly
		this.config = {
			...config,
			redis: {
				host: 'localhost',
				port: 6379,
				password: '',
				db: 0,
				url: '',
				...config.redis
			},
			keyPrefix: config.keyPrefix || 'endpoint_usage',
			trackingEnabled: config.trackingEnabled ?? true,
			excludePaths: config.excludePaths || [],
			includeQueryParams: config.includeQueryParams ?? false,
			aggregationInterval: config.aggregationInterval || 60,
			performanceTracking: {
				enabled: false,
				slowThresholdMs: 1000,
				percentiles: [50, 95, 99],
				memoryTracking: false,
				cpuTracking: false,
				...config.performanceTracking
			}
		};

		// Redis connection
		this.redis = new Redis(this.config.redis);
		this.setupRedisHandlers();
	}

	private setupRedisHandlers(): void {
		this.redis.on('connect', () => {
			console.log('Redis connected for endpoint tracking');
		});

		this.redis.on('error', (err: Error) => {
			console.error('Redis connection error:', err);
		});

		this.redis.on('end', () => {
			console.log('Redis connection ended');
		});
	}

	async connect(): Promise<void> {
		// ioredis connects automatically, this method is optional
		if (this.redis.status !== 'ready') {
			return new Promise((resolve, reject) => {
				this.redis.once('ready', resolve);
				this.redis.once('error', reject);
			});
		}
	}

	async disconnect(): Promise<void> {
		await this.redis.quit();
	}

	private shouldTrackPath(path: string): boolean {
		if (!this.config.trackingEnabled) return false;

		return !(
			this.config.excludePaths &&
			this.config.excludePaths.some(excludePath =>
				path.startsWith(excludePath)
			)
		);
	}

	private normalizeEndpoint(method: string, path: string): string {
		if (!this.config.includeQueryParams) {
			path = path.split('?')[0];
		}

		// Normalize path parameters (e.g., /users/123 -> /users/:id)
		path = path.replace(/\/\d+/g, '/:id');
		path = path.replace(/\/[a-f0-9-]{36}/g, '/:uuid'); // For UUIDs

		return `${method.toUpperCase()}:${path}`;
	}

	async trackUsage(usageData: Omit<UsageData, 'timestamp'>): Promise<void> {
		if (!this.shouldTrackPath(usageData.path)) {
			return;
		}

		const timestamp = Date.now();
		const normalizedEndpoint = this.normalizeEndpoint(usageData.method, usageData.path);

		const data: UsageData = {
			...usageData,
			timestamp,
		};

		// Save raw data (last 30 days)
		const rawKey = `${this.config.keyPrefix}:raw:${normalizedEndpoint}`;
		await this.redis.lpush(rawKey, JSON.stringify(data));
		await this.redis.expire(rawKey, 30 * 24 * 60 * 60); // 30 days

		// Update daily statistics
		await this.updateDailyStats(normalizedEndpoint, data);

		// Update general counters
		await this.updateCounters(normalizedEndpoint, data);

		// Update performance data
		await this.updatePerformanceStats(normalizedEndpoint, data);
	}

	private async updateDailyStats(endpoint: string, data: UsageData): Promise<void> {
		const today = new Date().toISOString().split('T')[0];
		const dailyKey = `${this.config.keyPrefix}:daily:${today}:${endpoint}`;

		const pipeline = this.redis.pipeline();

		// Increment total request count
		pipeline.hincrby(dailyKey, 'count', 1);

		// Increment status code count
		pipeline.hincrby(dailyKey, `status_${data.statusCode}`, 1);

		// Update first and last access times
		pipeline.hsetnx(dailyKey, 'first_accessed', data.timestamp.toString());
		pipeline.hset(dailyKey, 'last_accessed', data.timestamp.toString());

		// Update average response time
		if (data.responseTime) {
			pipeline.hincrbyfloat(dailyKey, 'total_response_time', data.responseTime);
			pipeline.hincrby(dailyKey, 'response_count', 1);
		}

		// Expire after 90 days
		pipeline.expire(dailyKey, 90 * 24 * 60 * 60);

		await pipeline.exec();
	}

	private async updateCounters(endpoint: string, data: UsageData): Promise<void> {
		const globalKey = `${this.config.keyPrefix}:global:${endpoint}`;

		const pipeline = this.redis.pipeline();
		pipeline.hincrby(globalKey, 'count', 1);
		pipeline.hsetnx(globalKey, 'first_accessed', data.timestamp.toString());
		pipeline.hset(globalKey, 'last_accessed', data.timestamp.toString());
		pipeline.hincrby(globalKey, `status_${data.statusCode}`, 1);

		if (data.responseTime) {
			pipeline.hincrbyfloat(globalKey, 'total_response_time', data.responseTime);
			pipeline.hincrby(globalKey, 'response_count', 1);
		}

		await pipeline.exec();
	}

	/**
	 * Calculates performance metrics
	 */
	private calculatePercentile(values: number[], percentile: number): number {
		if (values.length === 0) return 0;

		const sorted = values.sort((a, b) => a - b);
		const index = Math.ceil((percentile / 100) * sorted.length) - 1;
		return sorted[Math.max(0, index)];
	}

	/**
	 * Gets endpoint performance statistics
	 */
	async getPerformanceStats(method?: string, path?: string): Promise<EndpointStats[]> {
		const pattern = method && path
			? `${this.config.keyPrefix}:performance:${this.normalizeEndpoint(method, path)}`
			: `${this.config.keyPrefix}:performance:*`;

		const keys = await this.redis.keys(pattern);
		const stats: EndpointStats[] = [];

		for (const key of keys) {
			const data = await this.redis.hgetall(key);
			if (Object.keys(data).length === 0) continue;

			const endpoint = key.replace(`${this.config.keyPrefix}:performance:`, '');
			const [endpointMethod, endpointPath] = endpoint.split(':', 2);

			// Get raw response time data
			const rawKey = `${this.config.keyPrefix}:raw:${endpoint}`;
			const rawData = await this.redis.lrange(rawKey, 0, -1);
			const responseTimes = rawData
				.map((item: string) => JSON.parse(item))
				.filter((item: any) => item.responseTime)
				.map((item: any) => item.responseTime);

			const totalRequests = parseInt(data.total_requests || '0');
			const slowRequests = parseInt(data.slow_requests || '0');
			const errorRequests = parseInt(data.error_requests || '0');

			const performance: PerformanceMetrics = {
				p50ResponseTime: this.calculatePercentile(responseTimes, 50),
				p95ResponseTime: this.calculatePercentile(responseTimes, 95),
				p99ResponseTime: this.calculatePercentile(responseTimes, 99),
				slowRequestCount: slowRequests,
				errorRate: totalRequests > 0 ? errorRequests / totalRequests : 0,
				throughput: parseFloat(data.throughput || '0'),
				memoryUsage: parseFloat(data.avg_memory || '0'),
				cpuUsage: parseFloat(data.avg_cpu || '0'),
			};

			stats.push({
				path: endpointPath,
				method: endpointMethod,
				count: totalRequests,
				lastAccessed: new Date(parseInt(data.last_accessed || '0')),
				firstAccessed: new Date(parseInt(data.first_accessed || '0')),
				averageResponseTime: parseFloat(data.avg_response_time || '0'),
				statusCodes: {},
				performance,
			});
		}

		return stats.sort((a, b) => (b.performance?.p95ResponseTime || 0) - (a.performance?.p95ResponseTime || 0));
	}

	/**
	 * Gets slow endpoints
	 */
	async getSlowEndpoints(thresholdMs: number = 1000): Promise<EndpointStats[]> {
		const allStats = await this.getPerformanceStats();
		return allStats.filter(stat =>
			(stat.averageResponseTime || 0) > thresholdMs ||
			(stat.performance?.p95ResponseTime || 0) > thresholdMs
		);
	}

	/**
	 * Updates performance data
	 */
	private async updatePerformanceStats(endpoint: string, data: UsageData): Promise<void> {
		if (!this.config.performanceTracking.enabled) return;

		const perfKey = `${this.config.keyPrefix}:performance:${endpoint}`;
		const pipeline = this.redis.pipeline();

		// Update basic counters
		pipeline.hincrby(perfKey, 'total_requests', 1);
		pipeline.hsetnx(perfKey, 'first_accessed', data.timestamp.toString());
		pipeline.hset(perfKey, 'last_accessed', data.timestamp.toString());

		// Response time metrics
		if (data.responseTime) {
			pipeline.hincrbyfloat(perfKey, 'total_response_time', data.responseTime);
			pipeline.hincrby(perfKey, 'response_count', 1);

			// Slow request count
			if (data.responseTime > this.config.performanceTracking.slowThresholdMs) {
				pipeline.hincrby(perfKey, 'slow_requests', 1);
			}
		}

		// Error rate
		if (data.statusCode >= 400) {
			pipeline.hincrby(perfKey, 'error_requests', 1);
		}

		// Memory and CPU usage
		if (data.memoryUsage) {
			pipeline.hincrbyfloat(perfKey, 'total_memory', data.memoryUsage);
			pipeline.hincrby(perfKey, 'memory_count', 1);
		}

		if (data.cpuUsage) {
			pipeline.hincrbyfloat(perfKey, 'total_cpu', data.cpuUsage);
			pipeline.hincrby(perfKey, 'cpu_count', 1);
		}

		// Time window for throughput calculation
		const minuteKey = Math.floor(data.timestamp / 60000) * 60000;
		pipeline.hincrby(perfKey, `throughput_${minuteKey}`, 1);

		// Expire after 90 days
		pipeline.expire(perfKey, 90 * 24 * 60 * 60);

		await pipeline.exec();

		// Clean up old throughput data (outside the last hour)
		await this.cleanupOldThroughputData(perfKey, data.timestamp);
	}

	private async cleanupOldThroughputData(perfKey: string, currentTimestamp: number): Promise<void> {
		const data = await this.redis.hgetall(perfKey);
		const oneHourAgo = currentTimestamp - (60 * 60 * 1000);

		const fieldsToDelete = Object.keys(data)
			.filter(key => key.startsWith('throughput_'))
			.filter(key => {
				const timestamp = parseInt(key.replace('throughput_', ''));
				return timestamp < oneHourAgo;
			});

		if (fieldsToDelete.length > 0) {
			await this.redis.hdel(perfKey, ...fieldsToDelete);
		}
	}

	async getEndpointStats(method?: string, path?: string): Promise<EndpointStats[]> {
		const pattern = method && path
			? `${this.config.keyPrefix}:global:${this.normalizeEndpoint(method, path)}`
			: `${this.config.keyPrefix}:global:*`;

		const keys = await this.redis.keys(pattern);
		const stats: EndpointStats[] = [];

		for (const key of keys) {
			const data = await this.redis.hgetall(key);
			if (Object.keys(data).length === 0) continue;

			const endpoint = key.replace(`${this.config.keyPrefix}:global:`, '');
			const [endpointMethod, endpointPath] = endpoint.split(':', 2);

			const statusCodes: { [key: string]: number } = {};
			Object.keys(data).forEach(field => {
				if (field.startsWith('status_')) {
					const statusCode = field.replace('status_', '');
					statusCodes[statusCode] = parseInt(data[field]);
				}
			});

			const responseCount = parseInt(data.response_count || '0');
			const totalResponseTime = parseFloat(data.total_response_time || '0');

			stats.push({
				path: endpointPath,
				method: endpointMethod,
				count: parseInt(data.count || '0'),
				lastAccessed: new Date(parseInt(data.last_accessed || '0')),
				firstAccessed: new Date(parseInt(data.first_accessed || '0')),
				averageResponseTime: responseCount > 0 ? totalResponseTime / responseCount : undefined,
				statusCodes,
			});
		}

		return stats.sort((a, b) => b.count - a.count);
	}

	async getUnusedEndpoints(daysThreshold: number = 30): Promise<EndpointStats[]> {
		const allStats = await this.getEndpointStats();
		const thresholdDate = new Date();
		thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

		return allStats.filter(stat => stat.lastAccessed < thresholdDate);
	}

	async getDashboardData(days: number = 30): Promise<DashboardData> {
		const endDate = new Date();
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		const allStats = await this.getEndpointStats();
		const recentStats = allStats.filter(stat =>
			stat.lastAccessed >= startDate && stat.lastAccessed <= endDate
		);

		const totalRequests = recentStats.reduce((sum, stat) => sum + stat.count, 0);
		const sortedByUsage = [...recentStats].sort((a, b) => b.count - a.count);
		const unusedEndpoints = await this.getUnusedEndpoints(days);
		const slowEndpoints = await this.getSlowEndpoints(1000); // 1 second threshold

		// Calculate performance summary
		const totalResponseTime = recentStats.reduce((sum, stat) => sum + (stat.averageResponseTime || 0) * stat.count, 0);
		const averageResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;

		const totalSlowRequests = recentStats.reduce((sum, stat) => sum + (stat.performance?.slowRequestCount || 0), 0);
		const totalErrors = recentStats.reduce((sum, stat) => {
			const errorCount = Object.keys(stat.statusCodes)
				.filter(code => parseInt(code) >= 400)
				.reduce((errors, code) => errors + stat.statusCodes[code], 0);
			return sum + errorCount;
		}, 0);
		const averageErrorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

		const peakThroughput = Math.max(...recentStats.map(stat => stat.performance?.throughput || 0));

		return {
			totalRequests,
			uniqueEndpoints: recentStats.length,
			mostUsedEndpoints: sortedByUsage.slice(0, 10),
			leastUsedEndpoints: sortedByUsage.slice(-10).reverse(),
			unusedEndpoints,
			slowEndpoints: slowEndpoints.slice(0, 10),
			timeRange: {
				start: startDate,
				end: endDate,
			},
			performance: {
				averageResponseTime,
				totalSlowRequests,
				averageErrorRate,
				peakThroughput,
			},
		};
	}

	async clearStats(olderThanDays?: number): Promise<void> {
		if (olderThanDays) {
			// Delete data older than a specific date
			const thresholdDate = new Date();
			thresholdDate.setDate(thresholdDate.getDate() - olderThanDays);

			const dailyPattern = `${this.config.keyPrefix}:daily:*`;
			const dailyKeys = await this.redis.keys(dailyPattern);

			for (const key of dailyKeys) {
				const dateStr = key.split(':')[2];
				const keyDate = new Date(dateStr);
				if (keyDate < thresholdDate) {
					await this.redis.del(key);
				}
			}
		} else {
			// Delete all data
			const allKeys = await this.redis.keys(`${this.config.keyPrefix}:*`);
			if (allKeys.length > 0) {
				await this.redis.del(...allKeys);
			}
		}
	}

	/**
	 * Registers a new route in the system (for route discovery)
	 */
	async registerRoute(method: string, path: string): Promise<void> {
		if (!this.shouldTrackPath(path)) {
			return;
		}

		const normalizedEndpoint = this.normalizeEndpoint(method, path);
		const routeKey = `${this.config.keyPrefix}:routes:${normalizedEndpoint}`;

		// Record the time the route was discovered
		await this.redis.hsetnx(routeKey, 'discovered_at', Date.now().toString());
		await this.redis.hsetnx(routeKey, 'method', method.toUpperCase());
		await this.redis.hsetnx(routeKey, 'path', path);

		// Expire after 1 year
		await this.redis.expire(routeKey, 365 * 24 * 60 * 60);
	}

	/**
	 * Gets all registered routes
	 */
	async getRegisteredRoutes(): Promise<Array<{ method: string, path: string, discoveredAt: Date }>> {
		const pattern = `${this.config.keyPrefix}:routes:*`;
		const keys = await this.redis.keys(pattern);
		const routes: Array<{ method: string, path: string, discoveredAt: Date }> = [];

		for (const key of keys) {
			const data = await this.redis.hgetall(key);
			if (Object.keys(data).length === 0) continue;

			routes.push({
				method: data.method,
				path: data.path,
				discoveredAt: new Date(parseInt(data.discovered_at || '0'))
			});
		}

		return routes;
	}
}
