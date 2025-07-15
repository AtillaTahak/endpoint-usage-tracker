export interface EndpointUsageConfig {
	redis: {
		host?: string;
		port?: number;
		password?: string;
		db?: number;
		url?: string;
	};
	keyPrefix?: string;
	trackingEnabled?: boolean;
	excludePaths?: string[];
	includeQueryParams?: boolean;
	aggregationInterval?: number; // in seconds

	// Performance tracking configuration
	performanceTracking?: {
		enabled: boolean;
		slowThresholdMs: number; // Threshold for slow requests
		percentiles: number[]; // Percentiles to track (e.g., [50, 95, 99])
		memoryTracking?: boolean; // Track memory usage
		cpuTracking?: boolean; // Track CPU usage
	};
}

export interface PerformanceMetrics {
	p50ResponseTime: number; // 50th percentile response time
	p95ResponseTime: number; // 95th percentile response time
	p99ResponseTime: number; // 99th percentile response time
	slowRequestCount: number; // Number of slow requests
	errorRate: number; // Error rate (0-1)
	throughput: number; // Requests per minute
	memoryUsage?: number; // Memory usage in MB
	cpuUsage?: number; // CPU usage percentage
}

export interface EndpointStats {
	path: string;
	method: string;
	count: number;
	lastAccessed: Date;
	firstAccessed: Date;
	averageResponseTime?: number;
	statusCodes: { [key: string]: number };

	// Performance metrics
	performance?: PerformanceMetrics;
}

export interface UsageData {
	timestamp: number;
	method: string;
	path: string;
	statusCode: number;
	responseTime?: number;
	userAgent?: string;
	ip?: string;
	memoryUsage?: number;
	cpuUsage?: number;
}

export interface DashboardData {
	totalRequests: number;
	uniqueEndpoints: number;
	mostUsedEndpoints: EndpointStats[];
	leastUsedEndpoints: EndpointStats[];
	unusedEndpoints: EndpointStats[];
	slowEndpoints: EndpointStats[]; // New: slow endpoints
	timeRange: {
		start: Date;
		end: Date;
	};

	// Performance summary
	performance: {
		averageResponseTime: number;
		totalSlowRequests: number;
		averageErrorRate: number;
		peakThroughput: number;
	};
}
