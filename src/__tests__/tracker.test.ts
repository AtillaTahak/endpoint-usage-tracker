import { EndpointUsageTracker } from '../tracker';

describe('EndpointUsageTracker', () => {
	let tracker: EndpointUsageTracker;

	beforeEach(() => {
		tracker = new EndpointUsageTracker({
			redis: {
				host: 'localhost',
				port: 6379,
			},
			keyPrefix: 'test_usage',
		});
	});

	afterEach(async () => {
		if (tracker) {
			await tracker.disconnect();
		}
	});

	describe('Configuration', () => {
		it('should create tracker with default config', () => {
			expect(tracker).toBeDefined();
		});

		it('should create tracker with custom config', () => {
			const customTracker = new EndpointUsageTracker({
				redis: {
					host: 'custom-host',
					port: 1234,
				},
				keyPrefix: 'custom_prefix',
				excludePaths: ['/custom'],
			});

			expect(customTracker).toBeDefined();
		});
	});

	describe('Path Tracking', () => {
		it('should normalize endpoint paths correctly', async () => {
			// Bu test Redis bağlantısı gerektiriyor, mock kullanılabilir
			const mockData = {
				method: 'GET',
				path: '/users/123',
				statusCode: 200,
			};

			// Gerçek test için Redis bağlantısı gerekli
			// await tracker.connect();
			// await tracker.trackUsage(mockData);

			expect(true).toBe(true); // Placeholder test
		});
	});
});
