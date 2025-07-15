import { EndpointUsageTracker } from './tracker';
import { RouteDiscovery, RouteInfo } from './route-discovery';

export interface ReportConfig {
	enabled: boolean;
	intervalHours: number; // How often to generate a report in hours
	daysThreshold: number; // Report endpoints that have not been used for this many days

	// Performance alerts
	performanceAlerts?: {
		enabled: boolean;
		slowEndpointThresholdMs: number;    // Alert threshold for slow endpoints
		errorRateThreshold: number;         // Alert threshold for error rate
		throughputDropThreshold: number;    // Alert threshold for throughput drop
	};

	notifications: {
		webhook?: {
			url: string;
			headers?: Record<string, string>;
		};
		email?: {
			smtp: {
				host: string;
				port: number;
				secure: boolean;
				auth: {
					user: string;
					pass: string;
				};
			};
			from: string;
			to: string[];
			subject: string;
		};
		slack?: {
			webhookUrl: string;
			channel?: string;
		};
	};
	htmlReport?: {
		enabled: boolean;
		outputPath?: string;
	};
}

export interface UsageReport {
	generatedAt: Date;
	timeRange: {
		start: Date;
		end: Date;
	};
	summary: {
		totalRoutes: number;
		activeRoutes: number;
		unusedRoutes: number;
		unusedPercentage: number;
		averageResponseTime: number;
		slowEndpoints: number;
		highErrorRateEndpoints: number;
	};
	unusedEndpoints: Array<RouteInfo & {
		daysSinceLastUse: number;
		totalRequests: number;
	}>;
	topUnusedEndpoints: Array<RouteInfo & {
		daysSinceLastUse: number;
		totalRequests: number;
	}>;
	performanceIssues: {
		slowEndpoints: Array<RouteInfo & {
			averageResponseTime: number;
			p95ResponseTime: number;
		}>;
		highErrorRateEndpoints: Array<RouteInfo & {
			errorRate: number;
			totalRequests: number;
		}>;
	};
	recommendations: string[];
}

export class AutomaticReporter {
	private tracker: EndpointUsageTracker;
	private routeDiscovery: RouteDiscovery;
	private config: ReportConfig;
	private intervalId?: any;

	constructor(tracker: EndpointUsageTracker, config: ReportConfig) {
		this.tracker = tracker;
		this.routeDiscovery = new RouteDiscovery(tracker);
		this.config = config;
	}

	/**
	 * Starts automatic reporting
	 */
	start(): void {
		if (!this.config.enabled || this.intervalId) {
			return;
		}

		console.log(`Automatic reporting started. A report will be generated every ${this.config.intervalHours} hours.`);

		// Generate the first report immediately
		this.generateAndSendReport().catch(console.error);

		// Generate reports at specific intervals
		this.intervalId = setInterval(() => {
			this.generateAndSendReport().catch(console.error);
		}, this.config.intervalHours * 60 * 60 * 1000);
	}

	/**
	 * Stops automatic reporting
	 */
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = undefined;
			console.log('Automatic reporting stopped.');
		}
	}

	/**
	 * Discovers routes in the Express app
	 */
	discoverExpressRoutes(app: any, excludePatterns?: RegExp[]): RouteInfo[] {
		return this.routeDiscovery.discoverExpressRoutes(app, { excludePatterns });
	}

	/**
	 * Generates and sends a report
	 */
	private async generateAndSendReport(): Promise<void> {
		try {
			const report = await this.generateReport();

			if (report.unusedEndpoints.length === 0) {
				console.log('No unused endpoints found, report not sent.');
				return;
			}

			console.log(`${report.unusedEndpoints.length} unused endpoints detected.`);

			// Send notifications
			await this.sendNotifications(report);

			// Generate HTML report
			if (this.config.htmlReport?.enabled) {
				await this.generateHtmlReport(report);
			}

		} catch (error) {
			console.error('Error while generating report:', error);
		}
	}

	/**
	 * Generates the usage report
	 */
	async generateReport(): Promise<UsageReport> {
		const endDate = new Date();
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - this.config.daysThreshold);

		const usageReport = await this.routeDiscovery.generateUsageReport(this.config.daysThreshold);
		const dashboardData = await this.tracker.getDashboardData(this.config.daysThreshold);
		const performanceStats = await this.tracker.getPerformanceStats();

		const unusedWithDetails = usageReport.unusedRoutes.map(route => {
			const stats = usageReport.usageStats.find(s =>
				s.method === route.method && s.path === route.path
			);

			const daysSinceLastUse = stats
				? Math.floor((Date.now() - stats.lastAccessed.getTime()) / (1000 * 60 * 60 * 24))
				: this.config.daysThreshold + 1;

			return {
				...route,
				daysSinceLastUse,
				totalRequests: stats?.count || 0
			};
		});

		// Detect performance issues
		const slowThreshold = this.config.performanceAlerts?.slowEndpointThresholdMs || 2000;
		const errorRateThreshold = this.config.performanceAlerts?.errorRateThreshold || 0.05;

		const slowEndpoints = performanceStats
			.filter(stat => (stat.averageResponseTime || 0) > slowThreshold)
			.map(stat => ({
				method: stat.method,
				path: stat.path,
				middleware: [],
				handler: 'unknown',
				averageResponseTime: stat.averageResponseTime || 0,
				p95ResponseTime: stat.performance?.p95ResponseTime || 0,
			}));

		const highErrorRateEndpoints = performanceStats
			.filter(stat => (stat.performance?.errorRate || 0) > errorRateThreshold)
			.map(stat => ({
				method: stat.method,
				path: stat.path,
				middleware: [],
				handler: 'unknown',
				errorRate: stat.performance?.errorRate || 0,
				totalRequests: stat.count,
			}));

		const recommendations = this.generateRecommendations(
			unusedWithDetails,
			slowEndpoints,
			highErrorRateEndpoints
		);

		return {
			generatedAt: new Date(),
			timeRange: { start: startDate, end: endDate },
			summary: {
				totalRoutes: usageReport.total,
				activeRoutes: usageReport.used,
				unusedRoutes: usageReport.unused,
				unusedPercentage: Math.round((usageReport.unused / usageReport.total) * 100),
				averageResponseTime: dashboardData.performance.averageResponseTime,
				slowEndpoints: slowEndpoints.length,
				highErrorRateEndpoints: highErrorRateEndpoints.length,
			},
			unusedEndpoints: unusedWithDetails,
			topUnusedEndpoints: unusedWithDetails
				.sort((a, b) => b.daysSinceLastUse - a.daysSinceLastUse)
				.slice(0, 10),
			performanceIssues: {
				slowEndpoints: slowEndpoints.slice(0, 10),
				highErrorRateEndpoints: highErrorRateEndpoints.slice(0, 10),
			},
			recommendations
		};
	}

	private generateRecommendations(
		unusedEndpoints: any[],
		slowEndpoints: any[],
		highErrorRateEndpoints: any[]
	): string[] {
		const recommendations: string[] = [];

		// Unused endpoints recommendations
		if (unusedEndpoints.length === 0) {
			recommendations.push('All endpoints are actively being used. 👍');
		} else {
			const veryOldEndpoints = unusedEndpoints.filter(e => e.daysSinceLastUse > 90);
			if (veryOldEndpoints.length > 0) {
				recommendations.push(`${veryOldEndpoints.length} endpoints haven't been used for 90+ days. Consider removing them.`);
			}

			const neverUsedEndpoints = unusedEndpoints.filter(e => e.totalRequests === 0);
			if (neverUsedEndpoints.length > 0) {
				recommendations.push(`${neverUsedEndpoints.length} endpoints have never been used. Should be tested or removed.`);
			}

			if (unusedEndpoints.length > 5) {
				recommendations.push('Many unused endpoints detected. API cleanup recommended.');
			}
		}

		// Performance recommendations
		if (slowEndpoints.length > 0) {
			recommendations.push(`${slowEndpoints.length} endpoints have slow response times. Performance optimization needed.`);

			const verySlow = slowEndpoints.filter(e => e.averageResponseTime > 5000);
			if (verySlow.length > 0) {
				recommendations.push(`${verySlow.length} endpoints take >5s on average. Critical performance issue.`);
			}
		}

		if (highErrorRateEndpoints.length > 0) {
			recommendations.push(`${highErrorRateEndpoints.length} endpoints have high error rates. Investigation required.`);
		}

		return recommendations;
	}

	/**
	 * Sends notifications
	 */
	private async sendNotifications(report: UsageReport): Promise<void> {
		const promises: Promise<void>[] = [];

		if (this.config.notifications.webhook) {
			promises.push(this.sendWebhookNotification(report));
		}

		if (this.config.notifications.slack) {
			promises.push(this.sendSlackNotification(report));
		}

		if (this.config.notifications.email) {
			promises.push(this.sendEmailNotification(report));
		}

		await Promise.allSettled(promises);
	}

	private async sendWebhookNotification(report: UsageReport): Promise<void> {
		const { webhook } = this.config.notifications;
		if (!webhook) return;

		try {
			const response = await fetch(webhook.url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...webhook.headers
				},
				body: JSON.stringify({
					type: 'endpoint_usage_report',
					report: {
						summary: report.summary,
						unusedEndpoints: report.topUnusedEndpoints,
						recommendations: report.recommendations
					}
				})
			});

			if (!response.ok) {
				throw new Error(`Webhook failed: ${response.status}`);
			}
		} catch (error) {
			console.error('Webhook notification failed:', error);
		}
	}

	private async sendSlackNotification(report: UsageReport): Promise<void> {
		const { slack } = this.config.notifications;
		if (!slack) return;

		try {
			const message = this.formatSlackMessage(report);

			const response = await fetch(slack.webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(message)
			});

			if (!response.ok) {
				throw new Error(`Slack notification failed: ${response.status}`);
			}
		} catch (error) {
			console.error('Slack notification failed:', error);
		}
	}

	private formatSlackMessage(report: UsageReport): any {
		const { summary } = report;

		const color = summary.unusedPercentage > 30 || summary.slowEndpoints > 5 || summary.highErrorRateEndpoints > 3
			? 'danger'
			: summary.unusedPercentage > 15 || summary.slowEndpoints > 2 || summary.highErrorRateEndpoints > 1
				? 'warning'
				: 'good';

		return {
			text: '🔍 Endpoint Usage & Performance Report',
			attachments: [
				{
					color,
					fields: [
						{
							title: 'Usage Summary',
							value: `Total: ${summary.totalRoutes}\nActive: ${summary.activeRoutes}\nUnused: ${summary.unusedRoutes} (${summary.unusedPercentage}%)`,
							short: true
						},
						{
							title: 'Performance Summary',
							value: `Avg Response: ${Math.round(summary.averageResponseTime)}ms\nSlow Endpoints: ${summary.slowEndpoints}\nHigh Error Rate: ${summary.highErrorRateEndpoints}`,
							short: true
						},
						{
							title: 'Top Unused Endpoints',
							value: report.topUnusedEndpoints
								.slice(0, 3)
								.map(e => `• ${e.method} ${e.path} (${e.daysSinceLastUse}d)`)
								.join('\n') || 'None',
							short: false
						},
						{
							title: 'Performance Issues',
							value: [
								...report.performanceIssues.slowEndpoints.slice(0, 2).map(e =>
									`🐌 ${e.method} ${e.path} (${Math.round(e.averageResponseTime)}ms)`
								),
								...report.performanceIssues.highErrorRateEndpoints.slice(0, 2).map(e =>
									`❌ ${e.method} ${e.path} (${Math.round(e.errorRate * 100)}% errors)`
								)
							].join('\n') || 'No issues detected',
							short: false
						}
					],
					footer: 'Endpoint Usage Tracker',
					ts: Math.floor(report.generatedAt.getTime() / 1000)
				}
			]
		};
	}

	private async sendEmailNotification(report: UsageReport): Promise<void> {
		// Email sending requires a library like nodemailer
		// Placeholder for now
		console.log('Email notification placeholder - implement with nodemailer');
	}

	/**
	 * Generates an HTML report
	 */
	private async generateHtmlReport(report: UsageReport): Promise<void> {
		const html = this.generateHtmlContent(report);
		const outputPath = this.config.htmlReport?.outputPath || `./endpoint-report-${Date.now()}.html`;

		// Save the HTML file (fs module required)
		console.log(`HTML report will be saved to ${outputPath}`);
	}

	private generateHtmlContent(report: UsageReport): string {
		return `
<!DOCTYPE html>
<html>
<head>
    <title>Endpoint Usage Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .unused-endpoint { background: #fff2f2; padding: 10px; margin: 5px 0; border-left: 4px solid #ff6b6b; }
        .recommendations { background: #f0f8ff; padding: 15px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>🔍 Endpoint Usage Report</h1>
    <p><strong>Generated At:</strong> ${report.generatedAt.toLocaleString('en-US')}</p>

    <div class="summary">
        <h2>📊 Summary</h2>
        <p><strong>Total Endpoints:</strong> ${report.summary.totalRoutes}</p>
        <p><strong>Active Endpoints:</strong> ${report.summary.activeRoutes}</p>
        <p><strong>Unused Endpoints:</strong> ${report.summary.unusedRoutes} (${report.summary.unusedPercentage}%)</p>
    </div>

    <h2>🚫 Unused Endpoints</h2>
    ${report.unusedEndpoints.map(endpoint => `
        <div class="unused-endpoint">
            <strong>${endpoint.method} ${endpoint.path}</strong><br>
            Last used: ${endpoint.daysSinceLastUse} days ago<br>
            Total requests: ${endpoint.totalRequests}
        </div>
    `).join('')}

    <div class="recommendations">
        <h2>💡 Recommendations</h2>
        <ul>
            ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
</body>
</html>`;
	}
}
