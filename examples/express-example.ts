import express, { Application } from 'express';
import {
	createTracker,
	createExpressMiddleware,
	EndpointUsageTracker,
	AutomaticReporter,
} from '../src';

// --- 1. Initialization ---
const app: Application = express();
const PORT = process.env.PORT || 3000;

// Create the endpoint usage tracker
const tracker: EndpointUsageTracker = createTracker({
	redis: {
		host: 'localhost',
		port: 6379,
	},
	keyPrefix: 'my_express_app_usage',
	excludePaths: ['/health', '/metrics', '/favicon.ico'],
	performanceTracking: {
		enabled: true,
		slowThresholdMs: 500,
		percentiles: [50, 95, 99],
	}
});

// Create the automatic reporter
const reporter: AutomaticReporter = new AutomaticReporter(tracker, {
	enabled: true,
	intervalHours: 24, // Generate a report every 24 hours
	daysThreshold: 30, // Report endpoints unused for 30 days
	notifications: {
		// Example: Send a report to a webhook endpoint
		webhook: {
			url: 'https://your-webhook-url.com/endpoint-report',
			headers: {
				'Authorization': 'Bearer your-secret-token'
			}
		},
		// Example: Send a report to a Slack channel
		slack: {
			webhookUrl: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
		}
	},
	htmlReport: {
		enabled: true,
		outputPath: './reports/endpoint-usage-report.html'
	}
});

// --- 2. Middleware Setup ---

// Use the tracking middleware for all incoming requests
app.use(createExpressMiddleware({
	tracker,
}));


// --- 3. Application Routes ---

app.get('/', (req, res) => {
	res.send('<h1>Welcome to the Express Example!</h1><p>Check out the <a href="/dashboard">/dashboard</a> to see usage stats.</p>');
});

app.get('/users', (req, res) => {
	res.json({ users: ['Alice', 'Bob', 'Charlie'] });
});

app.get('/users/:id', (req, res) => {
	// Simulate a slow response for demonstration
	setTimeout(() => {
		res.json({ user: { id: req.params.id, name: 'Test User' } });
	}, 700);
});

app.post('/users', (req, res) => {
	res.status(201).json({ message: 'User created successfully' });
});

// This endpoint will likely be reported as "unused" after 30 days
app.get('/legacy-endpoint', (req, res) => {
	res.json({ message: 'This is an old endpoint that is no longer used.' });
});

// An endpoint that sometimes fails
app.get('/unstable', (req, res) => {
	if (Math.random() > 0.5) {
		res.status(500).json({ error: 'Internal Server Error' });
	} else {
		res.json({ status: 'OK' });
	}
});

// Health check endpoint (excluded from tracking)
app.get('/health', (req, res) => {
	res.json({ status: 'OK' });
});


// --- 4. Tracker API Endpoints ---

// An endpoint to view the live dashboard data
app.get('/dashboard', async (req, res) => {
	try {
		const days = parseInt(req.query.days as string) || 30;
		const dashboard = await tracker.getDashboardData(days);
		res.json(dashboard);
	} catch (error) {
		console.error('Failed to get dashboard data:', error);
		res.status(500).json({ error: 'Could not retrieve dashboard data.' });
	}
});

// An endpoint to see performance statistics
app.get('/performance', async (req, res) => {
	try {
		const stats = await tracker.getPerformanceStats();
		res.json(stats);
	} catch (error) {
		console.error('Failed to get performance stats:', error);
		res.status(500).json({ error: 'Could not retrieve performance stats.' });
	}
});


// --- 5. Server Startup ---

const startServer = async () => {
	try {
		// Connect to Redis
		await tracker.connect();
		console.log('✅ Tracker connected to Redis successfully!');

		// Start the server
		const server = app.listen(PORT, () => {
			console.log(`🚀 Server is running at http://localhost:${PORT}`);

			// NOW that the server is running and all routes are defined, discover them.
			console.log('🔍 Discovering application routes...');
			const discoveredRoutes = reporter.discoverExpressRoutes(app, [
				/\/health$/, // Exclude health check from discovery
			]);
			console.log(`✅ Discovered ${discoveredRoutes.length} routes.`);

			// Start the automatic reporter
			reporter.start();
		});

		// Graceful shutdown
		process.on('SIGINT', async () => {
			console.log('\n🚦 Shutting down server...');
			reporter.stop();
			await tracker.disconnect();
			server.close(() => {
				console.log('✅ Server shut down gracefully.');
				process.exit(0);
			});
		});

	} catch (error) {
		console.error('❌ Failed to start server:', error);
		process.exit(1);
	}
};

startServer();
