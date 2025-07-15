# Endpoint Usage Tracker

Redis tabanlı endpoint kullanım istatistikleri takip paketi. NestJS ve Express.js uygulamaları için middleware/interceptor sağlar ve **otomatik route keşfi** ile kullanılmayan endpointleri tespit eder.

## 🚀 Yeni Özellikler

- **Otomatik Route Keşfi**: Uygulama başlangıcında tüm endpoint'leri otomatik keşfeder
- **Otomatik Raporlama**: Belirli aralıklarla kullanılmayan endpoint'leri raporlar
- **Çoklu Bildirim**: Slack, Webhook ve Email desteği
- **HTML Raporları**: Detaylı HTML formatında raporlar
- **Akıllı Öneriler**: Kullanım verilerine dayalı öneriler

## Özellikler

- 🚀 **Redis Desteği**: Veriler Redis'te saklanır, deployment'lardan etkilenmez
- 📊 **Detaylı İstatistikler**: Endpoint kullanım sayıları, response time'lar, status kodları
- 🔧 **Framework Agnostic**: NestJS ve Express.js desteği
- � **Otomatik Keşif**: Uygulama başlangıcında tüm route'ları otomatik keşfeder
- �📈 **Dashboard Verileri**: Kullanım trendleri ve analitik veriler
- 🧹 **Otomatik Temizlik**: Eski verilerin otomatik silinmesi
- ⚡ **Performanslı**: Asenkron işlemler, minimum overhead
- 🔔 **Otomatik Bildirim**: Slack, webhook ve email bildirimleri

## Kurulum

```bash
npm install endpoint-usage-tracker
```

## Express.js Kullanımı (Otomatik Route Keşfi ile)

```typescript
import express from 'express';
import {
  createTracker,
  createExpressMiddleware,
  createAutomaticReporter
} from 'endpoint-usage-tracker';

const app = express();

// Tracker'ı oluştur
const tracker = createTracker({
  redis: { host: 'localhost', port: 6379 },
  keyPrefix: 'my_app_usage',
  excludePaths: ['/health', '/metrics'],
});

// Otomatik raporlayıcıyı oluştur
const reporter = createAutomaticReporter(tracker, {
  enabled: true,
  intervalHours: 24, // Her gün rapor oluştur
  daysThreshold: 30, // 30 gündür kullanılmayanları raporla
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

// Middleware'i ekle
app.use(createExpressMiddleware({ tracker }));

// Route'larınızı tanımlayın
app.get('/users', (req, res) => res.json({ users: [] }));
app.post('/users', (req, res) => res.json({ created: true }));
app.get('/posts/:id', (req, res) => res.json({ post: {} }));

// Uygulama başladıktan sonra route'ları keşfet
tracker.connect().then(() => {
  // Tüm route'ları otomatik keşfet
  const discoveredRoutes = reporter.discoverExpressRoutes(app, [
    /\/health$/, // Health check'i hariç tut
    /\/metrics$/ // Metrics'i hariç tut
  ]);

  console.log(`${discoveredRoutes.length} route keşfedildi`);

  // Otomatik raporlamayı başlat
  reporter.start();
});

app.listen(3000);
```

## NestJS Kullanımı (Önerilen Kurulum)

NestJS'te sağlam ve ölçeklenebilir bir kurulum için, izleyiciye özel, global bir modül oluşturmak en iyi yöntemdir.

### Adım 1: `TrackerModule` Oluşturun

`src/core/tracker.module.ts` gibi yeni bir dosya oluşturun. Bu modül, tüm izleme mantığını kapsayacak ve global olarak kullanılabilir hale getirecektir.

```typescript
// src/core/tracker.module.ts
import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  EndpointUsageTracker,
  EndpointUsageInterceptor,
  createTracker,
  EndpointUsageConfig,
} from 'endpoint-usage-tracker';

@Global() // <-- Bu decorator, modülün provider'larını her yerde kullanılabilir yapar
@Module({
  providers: [
    // Yapılandırma provider'ı
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
    // Tracker provider'ı, tip-güvenli enjeksiyon için token olarak sınıfın kendisini kullanır
    {
      provide: EndpointUsageTracker,
      useFactory: (config: EndpointUsageConfig) => {
        const tracker = createTracker(config);
        tracker.connect();
        return tracker;
      },
      inject: ['ENDPOINT_USAGE_CONFIG'],
    },
    // Interceptor provider'ı, tracker'ı doğru şekilde enjekte etmek için bir factory kullanır
    {
      provide: APP_INTERCEPTOR,
      useFactory: (tracker: EndpointUsageTracker) => {
        return new EndpointUsageInterceptor({ tracker });
      },
      inject: [EndpointUsageTracker],
    },
  ],
  // Tracker'ı diğer modüllerde enjekte edilebilir yapmak için dışa aktarın
  exports: [EndpointUsageTracker],
})
export class TrackerModule {}
```

### Adım 2: `TrackerModule`'ü `AppModule`'e Import Edin

Ana `app.module.ts` dosyanızda, sadece `TrackerModule`'ü import edin.

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { TrackerModule } from './core/tracker.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    TrackerModule, // <-- Global modülü buraya bir kez import edin
    UsersModule,
    // ... diğer modülleriniz
  ],
})
export class AppModule {}
```

### Adım 3: Tracker'ı Enjekte Edin ve Kullanın

Artık `EndpointUsageTracker`'ı, `@Inject()` decorator'üne ihtiyaç duymadan, tipine göre uygulamanızdaki herhangi bir controller veya servise enjekte edebilirsiniz.

```typescript
// src/users/users.controller.ts
import { Controller, Get } from '@nestjs/common';
import { EndpointUsageTracker } from 'endpoint-usage-tracker';

@Controller('users')
export class UsersController {
  constructor(
    // NestJS, global modül sayesinde bağımlılığı tipine göre çözer
    private readonly tracker: EndpointUsageTracker,
  ) {}

  @Get('stats/dashboard')
  async getDashboard() {
    return this.tracker.getDashboardData(30);
  }
}
```

## Konfigürasyon

```typescript
interface EndpointUsageConfig {
  redis: {
    host?: string;          // Redis host (default: 'localhost')
    port?: number;          // Redis port (default: 6379)
    password?: string;      // Redis şifresi
    db?: number;           // Redis database numarası (default: 0)
    url?: string;          // Redis connection URL
  };
  keyPrefix?: string;                    // Redis key prefix (default: 'endpoint_usage')
  trackingEnabled?: boolean;             // Tracking aktif/pasif (default: true)
  excludePaths?: string[];               // Hariç tutulacak path'lar
  includeQueryParams?: boolean;          // Query parametrelerini dahil et (default: false)
  aggregationInterval?: number;          // Toplama aralığı (dakika, default: 60)
}
```

## API Metodları

### `trackUsage(data: UsageData)`
Endpoint kullanım verilerini kaydeder.

### `getEndpointStats(method?: string, path?: string)`
Endpoint istatistiklerini getirir.

### `getUnusedEndpoints(daysThreshold: number)`
Belirtilen gün sayısından uzun süredir kullanılmayan endpointleri getirir.

### `getDashboardData(days: number)`
Dashboard için özet istatistikleri getirir.

### `clearStats(olderThanDays?: number)`
İstatistikleri temizler. Parametre verilirse belirtilen günden eski veriler silinir.

## Veri Yapısı

### EndpointStats
```typescript
{
  path: string;                    // Endpoint path'i
  method: string;                  // HTTP method'u
  count: number;                   // Toplam istek sayısı
  lastAccessed: Date;              // Son erişim zamanı
  firstAccessed: Date;             // İlk erişim zamanı
  averageResponseTime?: number;    // Ortalama response time (ms)
  statusCodes: { [key: string]: number }; // Status kod dağılımı
}
```

### DashboardData
```typescript
{
  totalRequests: number;           // Toplam istek sayısı
  uniqueEndpoints: number;         // Benzersiz endpoint sayısı
  mostUsedEndpoints: EndpointStats[];  // En çok kullanılan endpointler
  leastUsedEndpoints: EndpointStats[]; // En az kullanılan endpointler
  unusedEndpoints: EndpointStats[];    // Kullanılmayan endpointler
  timeRange: {
    start: Date;
    end: Date;
  };
}
```

## Örnekler

Detaylı örnekler için `examples/` klasörüne bakın:
- [Express.js örneği](./examples/express-example.ts)
- [NestJS örneği](./examples/nestjs-example.ts)

## Redis Veri Modeli

Paket Redis'te şu key pattern'lerini kullanır:

- `{prefix}:global:{METHOD}:{path}` - Global endpoint istatistikleri
- `{prefix}:daily:{YYYY-MM-DD}:{METHOD}:{path}` - Günlük istatistikler
- `{prefix}:raw:{METHOD}:{path}` - Ham istek verileri (son 30 gün)

## Performans

- Asenkron Redis işlemleri
- Pipeline kullanımı ile batch işlemler
- Otomatik key expiration
- Minimum memory footprint

## Lisans

MIT

## Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add some amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request açın

## TODO

- [ ] GraphQL desteği
- [ ] Prometheus metrics export
- [ ] Real-time dashboard
- [ ] Alert sistemi
- [ ] Bulk export/import
- [ ] Rate limiting entegrasyonu

## Otomatik Raporlama Konfigürasyonu

```typescript
interface ReportConfig {
  enabled: boolean;              // Raporlamayı aktif/pasif yap
  intervalHours: number;         // Kaç saatte bir rapor oluştur
  daysThreshold: number;         // Kaç günden uzun süredir kullanılmayanları raporla

  notifications: {
    // Slack bildirimi
    slack?: {
      webhookUrl: string;
      channel?: string;
    };

    // Webhook bildirimi
    webhook?: {
      url: string;
      headers?: Record<string, string>;
    };

    // Email bildirimi (gelecekte)
    email?: {
      smtp: { /* SMTP ayarları */ };
      from: string;
      to: string[];
      subject: string;
    };
  };

  // HTML raporu
  htmlReport?: {
    enabled: boolean;
    outputPath?: string;  // Varsayılan: './endpoint-report-{timestamp}.html'
  };
}
```

### Örnek Rapor Çıktısı

Sistem otomatik olarak şu tür raporlar oluşturur:

```json
{
  "generatedAt": "2025-07-14T10:00:00.000Z",
  "summary": {
    "totalRoutes": 25,
    "activeRoutes": 18,
    "unusedRoutes": 7,
    "unusedPercentage": 28
  },
  "unusedEndpoints": [
    {
      "method": "DELETE",
      "path": "/users/:id/avatar",
      "daysSinceLastUse": 45,
      "totalRequests": 0
    }
  ],
  "recommendations": [
    "7 endpoint 30+ gündür kullanılmıyor. Bunları silmeyi düşünün.",
    "3 endpoint hiç kullanılmamış. Test edilmeli veya silinmeli."
  ]
}
```
