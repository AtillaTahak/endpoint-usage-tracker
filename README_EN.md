# Endpoint Usage Tracker

Redis-based endpoint usage statistics tracking package for NestJS and Express.js applications with **automatic route discovery** to detect unused endpoints.

## 🚀 New Features

- **Automatic Route Discovery**: Automatically discovers all endpoints on application startup
- **Automatic Reporting**: Reports unused endpoints at specified intervals
- **Multiple Notifications**: Slack, Webhook, and Email support
- **HTML Reports**: Detailed reports in HTML format
- **Smart Recommendations**: Usage data-based suggestions
- **Performance Metrics**: Response time analysis, slow endpoint detection

## Features

- 🚀 **Redis Support**: Data stored in Redis, unaffected by deployments
- 📊 **Detailed Statistics**: Endpoint usage counts, response times, status codes
- 🔧 **Framework Agnostic**: NestJS and Express.js support
- 🔍 **Automatic Discovery**: Automatically discovers all routes on application startup
- 📈 **Dashboard Data**: Usage trends and analytics
- 🧹 **Automatic Cleanup**: Automatic deletion of old data
- ⚡ **Performance Metrics**: Response time analysis, P95/P99 percentiles
- 🔔 **Automatic Notifications**: Slack, webhook, and email notifications
- 🎯 **Performance Alerts**: Alerts for slow endpoints and performance degradation

## Installation

```bash
npm install endpoint-usage-tracker
```

## Express.js Usage (with Automatic Route Discovery)

```typescript
import express from 'express';
import {
  createTracker,
  createExpressMiddleware,
  createAutomaticReporter
} from 'endpoint-usage-tracker';

const app = express();

// Create tracker
const tracker = createTracker({
  redis: { host: 'localhost', port: 6379 },
  keyPrefix: 'my_app_usage',
  excludePaths: ['/health', '/metrics'],
  performanceTracking: {
    enabled: true,
    slowThresholdMs: 1000, // Alert if response time > 1s
    percentiles: [50, 95, 99] // Track P50, P95, P99
  }
});

// Create automatic reporter
const reporter = createAutomaticReporter(tracker, {
  enabled: true,
  intervalHours: 24, // Generate report daily
  daysThreshold: 30, // Report endpoints unused for 30+ days
  performanceAlerts: {
    enabled: true,
    slowEndpointThresholdMs: 2000,
    errorRateThreshold: 0.05 // 5% error rate threshold
  },
  notifications: {
    slack: {
      webhookUrl: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
    },
    webhook: {
      url: 'https://your-api.com/webhook',
      headers: { 'Authorization': 'Bearer token' }
    }
  },
  htmlReport: {
    enabled: true,
    outputPath: './reports/endpoint-report.html'
  }
});

// Add middleware
app.use(createExpressMiddleware({
  tracker,
  includeUserAgent: true,
  includeIP: true,
  trackResponseTime: true
}));

// Define your routes
app.get('/users', (req, res) => res.json({ users: [] }));
app.post('/users', (req, res) => res.json({ created: true }));
app.get('/posts/:id', (req, res) => res.json({ post: {} }));

// Start after defining routes
tracker.connect().then(() => {
  // Automatically discover all routes
  const discoveredRoutes = reporter.discoverExpressRoutes(app, [
    /\/health$/, // Exclude health check
    /\/metrics$/ // Exclude metrics
  ]);

  console.log(`${discoveredRoutes.length} routes discovered`);

  // Start automatic reporting
  reporter.start();
});

app.listen(3000);
```

## NestJS Usage

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EndpointUsageInterceptor, createTracker } from 'endpoint-usage-tracker';

@Module({
  providers: [
    {
      provide: 'ENDPOINT_USAGE_CONFIG',
      useValue: {
        redis: {
          host: 'localhost',
          port: 6379,
        },
        keyPrefix: 'nestjs_app_usage',
        performanceTracking: {
          enabled: true,
          slowThresholdMs: 1000,
          percentiles: [50, 95, 99]
        }
      },
    },
    {
      provide: 'ENDPOINT_USAGE_TRACKER',
      useFactory: (config) => {
        const tracker = createTracker(config);
        tracker.connect();
        return tracker;
      },
      inject: ['ENDPOINT_USAGE_CONFIG'],
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: EndpointUsageInterceptor,
    },
  ],
})
export class AppModule {}

// controller usage
@Controller('stats')
export class StatsController {
  constructor(
    @Inject('ENDPOINT_USAGE_TRACKER')
    private readonly tracker: EndpointUsageTracker,
  ) {}

  @Get()
  async getStats() {
    return await this.tracker.getEndpointStats();
  }

  @Get('performance')
  async getPerformanceStats() {
    return await this.tracker.getPerformanceStats();
  }
}
```

## Configuration

```typescript
interface EndpointUsageConfig {
  redis: {
    host?: string;          // Redis host (default: 'localhost')
    port?: number;          // Redis port (default: 6379)
    password?: string;      // Redis password
    db?: number;           // Redis database number (default: 0)
    url?: string;          // Redis connection URL
  };
  keyPrefix?: string;                    // Redis key prefix (default: 'endpoint_usage')
  trackingEnabled?: boolean;             // Enable/disable tracking (default: true)
  excludePaths?: string[];               // Paths to exclude from tracking
  includeQueryParams?: boolean;          // Include query parameters (default: false)
  aggregationInterval?: number;          // Aggregation interval in minutes (default: 60)

  // Performance tracking configuration
  performanceTracking?: {
    enabled: boolean;
    slowThresholdMs: number;            // Threshold for slow requests
    percentiles: number[];              // Percentiles to track (e.g., [50, 95, 99])
    memoryTracking?: boolean;           // Track memory usage
    cpuTracking?: boolean;              // Track CPU usage
  };
}
```

## API Methods

### `trackUsage(data: UsageData)`
Records endpoint usage data.

### `getEndpointStats(method?: string, path?: string)`
Returns endpoint statistics.

### `getPerformanceStats(method?: string, path?: string)`
Returns performance statistics including percentiles.

### `getUnusedEndpoints(daysThreshold: number)`
Returns endpoints unused for specified number of days.

### `getDashboardData(days: number)`
Returns dashboard summary statistics.

### `getSlowEndpoints(thresholdMs: number)`
Returns endpoints with average response time above threshold.

### `clearStats(olderThanDays?: number)`
Clears statistics. If parameter provided, deletes data older than specified days.

## Data Structure

### EndpointStats
```typescript
{
  path: string;                         // Endpoint path
  method: string;                       // HTTP method
  count: number;                        // Total request count
  lastAccessed: Date;                   // Last access time
  firstAccessed: Date;                  // First access time
  averageResponseTime?: number;         // Average response time (ms)
  statusCodes: { [key: string]: number }; // Status code distribution

  // Performance metrics
  performance: {
    p50ResponseTime: number;            // 50th percentile response time
    p95ResponseTime: number;            // 95th percentile response time
    p99ResponseTime: number;            // 99th percentile response time
    slowRequestCount: number;           // Number of slow requests
    errorRate: number;                  // Error rate (0-1)
    throughput: number;                 // Requests per minute
  };
}
```

### DashboardData
```typescript
{
  totalRequests: number;               // Total request count
  uniqueEndpoints: number;             // Unique endpoint count
  mostUsedEndpoints: EndpointStats[];  // Most used endpoints
  leastUsedEndpoints: EndpointStats[]; // Least used endpoints
  unusedEndpoints: EndpointStats[];    // Unused endpoints
  slowEndpoints: EndpointStats[];      // Slow endpoints
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
```

## Automatic Reporting Configuration

```typescript
interface ReportConfig {
  enabled: boolean;              // Enable/disable reporting
  intervalHours: number;         // Report generation interval
  daysThreshold: number;         // Days threshold for unused endpoints

  // Performance alerts
  performanceAlerts?: {
    enabled: boolean;
    slowEndpointThresholdMs: number;    // Alert threshold for slow endpoints
    errorRateThreshold: number;         // Alert threshold for error rate
    throughputDropThreshold: number;    // Alert threshold for throughput drop
  };

  notifications: {
    // Slack notification
    slack?: {
      webhookUrl: string;
      channel?: string;
    };

    // Webhook notification
    webhook?: {
      url: string;
      headers?: Record<string, string>;
    };

    // Email notification (future)
    email?: {
      smtp: { /* SMTP settings */ };
      from: string;
      to: string[];
      subject: string;
    };
  };

  // HTML report
  htmlReport?: {
    enabled: boolean;
    outputPath?: string;  // Default: './endpoint-report-{timestamp}.html'
  };
}
```

### Sample Report Output

The system automatically generates reports like:

```json
{
  "generatedAt": "2025-07-14T10:00:00.000Z",
  "summary": {
    "totalRoutes": 25,
    "activeRoutes": 18,
    "unusedRoutes": 7,
    "unusedPercentage": 28,
    "averageResponseTime": 245,
    "slowEndpoints": 3
  },
  "unusedEndpoints": [
    {
      "method": "DELETE",
      "path": "/users/:id/avatar",
      "daysSinceLastUse": 45,
      "totalRequests": 0
    }
  ],
  "slowEndpoints": [
    {
      "method": "GET",
      "path": "/reports/export",
      "averageResponseTime": 3200,
      "p95ResponseTime": 5100
    }
  ],
  "recommendations": [
    "7 endpoints unused for 30+ days. Consider removing them.",
    "3 endpoints have average response time > 2s. Optimize performance.",
    "Endpoint '/api/search' has 8% error rate. Investigate issues."
  ]
}
```

## Performance Monitoring Features

### Response Time Tracking
- Average, median, P95, P99 response times
- Slow request detection and alerting
- Response time trends over time

### Error Rate Monitoring
- HTTP status code distribution
- Error rate calculation and trending
- Error spike detection

### Throughput Analysis
- Requests per minute/hour/day
- Peak load identification
- Capacity planning insights

### Memory & CPU Tracking (Optional)
- Memory usage per endpoint
- CPU utilization correlation
- Resource usage optimization recommendations

## Examples

For detailed examples, see the `examples/` folder:
- [Express.js example](./examples/express-example.ts)
- [NestJS example](./examples/nestjs-example.ts)

## Redis Data Model

The package uses these Redis key patterns:

- `{prefix}:global:{METHOD}:{path}` - Global endpoint statistics
- `{prefix}:daily:{YYYY-MM-DD}:{METHOD}:{path}` - Daily statistics
- `{prefix}:raw:{METHOD}:{path}` - Raw request data (last 30 days)
- `{prefix}:performance:{METHOD}:{path}` - Performance metrics
- `{prefix}:routes:{METHOD}:{path}` - Discovered routes

## Performance

- Asynchronous Redis operations
- Pipeline usage for batch operations
- Automatic key expiration
- Minimum memory footprint
- Sub-millisecond tracking overhead

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## TODO

- [ ] GraphQL support
- [ ] Prometheus metrics export
- [ ] Real-time dashboard
- [ ] Advanced alerting system
- [ ] Bulk export/import
- [ ] Rate limiting integration
- [ ] Machine learning-based anomaly detection
