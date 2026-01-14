const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const client = require('prom-client');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 5000;

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

// Custom metrics
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 5, 15, 50, 100, 500]
});

const databaseQueryDuration = new client.Histogram({
  name: 'database_query_duration_ms',
  help: 'Duration of database queries in ms',
  labelNames: ['operation', 'table'],
  buckets: [0.1, 1, 5, 10, 25, 50]
});

const databaseConnectionRetries = new client.Counter({
  name: 'database_connection_retries_total',
  help: 'Total number of database connection retries'
});

// Database connection with retry logic
async function connectToDatabaseWithRetry() {
  const maxRetries = parseInt(process.env.DATABASE_RETRY_ATTEMPTS) || 10;
  const retryDelay = parseInt(process.env.DATABASE_RETRY_DELAY) || 5000; // 5 seconds
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📊 Database connection attempt ${attempt}/${maxRetries}`);
      
      const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'mydatabase',
        user: process.env.DB_USER || 'myuser',
        password: process.env.DB_PASSWORD || 'mypassword',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000, // Shorter timeout for retries
      });

      // Test connection
      await pool.query('SELECT 1');
      
      console.log('✅ Database connected successfully!');
      return pool;
      
    } catch (error) {
      lastError = error;
      databaseConnectionRetries.inc();
      console.log(`❌ Database connection failed (attempt ${attempt}):`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  throw new Error(`Failed to connect to database after ${maxRetries} attempts. Last error: ${lastError.message}`);
}

// Redis connection with retry logic - made more resilient
async function connectToRedisWithRetry() {
  const maxRetries = 3; // Reduced retries to start faster
  const retryDelay = 3000; // 3 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📊 Redis connection attempt ${attempt}/${maxRetries}`);
      
      const redisClient = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          connectTimeout: 5000,
        }
      });

      await redisClient.connect();
      console.log('✅ Redis connected successfully!');
      return redisClient;
      
    } catch (error) {
      console.log(`❌ Redis connection failed (attempt ${attempt}):`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  console.warn('⚠️  Continuing without Redis cache - Redis is optional');
  return null; // Return null instead of throwing error
}

// Global variables for database and Redis connections
let pool;
let redisClient;

// Initialize connections
async function initializeConnections() {
  try {
    pool = await connectToDatabaseWithRetry();
    redisClient = await connectToRedisWithRetry(); // This won't throw error if Redis fails
    console.log('🚀 All connections established successfully!');
  } catch (error) {
    console.error('💥 Failed to initialize connections:', error);
    process.exit(1);
  }
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Simple health check (for Kubernetes liveness probe)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'backend',
    timestamp: new Date().toISOString()
  });
});

// Enhanced health check (for Kubernetes readiness probe) - Redis is optional
app.get('/ready', async (req, res) => {
  const healthCheck = {
    status: 'READY',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  try {
    // Check database connection (REQUIRED)
    const dbStart = Date.now();
    if (pool) {
      await pool.query('SELECT 1');
      healthCheck.checks.database = { 
        status: 'Connected', 
        responseTime: `${Date.now() - dbStart}ms` 
      };
    } else {
      healthCheck.checks.database = { status: 'Not Initialized' };
      healthCheck.status = 'NOT_READY';
    }
  } catch (error) {
    healthCheck.checks.database = { status: 'Error', error: error.message };
    healthCheck.status = 'NOT_READY';
  }

  // Check Redis connection (OPTIONAL - don't fail readiness if Redis is down)
  try {
    const redisStart = Date.now();
    if (redisClient && redisClient.isOpen) {
      await redisClient.ping();
      healthCheck.checks.redis = { 
        status: 'Connected', 
        responseTime: `${Date.now() - redisStart}ms` 
      };
    } else {
      healthCheck.checks.redis = { status: 'Not Available' };
      // Don't change status - Redis is optional
    }
  } catch (error) {
    healthCheck.checks.redis = { status: 'Error', error: error.message };
    // Don't change status - Redis is optional
  }

  const statusCode = healthCheck.status === 'READY' ? 200 : 503;
  res.status(statusCode).json(healthCheck);
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Enhanced health check (for detailed monitoring)
app.get('/api/health', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  try {
    // Check database connection
    const dbStart = Date.now();
    if (pool) {
      await pool.query('SELECT 1');
      healthCheck.checks.database = { 
        status: 'Connected', 
        responseTime: `${Date.now() - dbStart}ms` 
      };
    } else {
      healthCheck.checks.database = { status: 'Not Initialized' };
      healthCheck.status = 'Error';
    }
  } catch (error) {
    healthCheck.checks.database = { status: 'Error', error: error.message };
    healthCheck.status = 'Error';
  }

  // Redis check - optional
  try {
    const redisStart = Date.now();
    if (redisClient && redisClient.isOpen) {
      await redisClient.ping();
      healthCheck.checks.redis = { 
        status: 'Connected', 
        responseTime: `${Date.now() - redisStart}ms` 
      };
    } else {
      healthCheck.checks.redis = { status: 'Not Available' };
      // Don't change overall status for Redis
    }
  } catch (error) {
    healthCheck.checks.redis = { status: 'Error', error: error.message };
    // Don't change overall status for Redis
  }

  res.json(healthCheck);
});

// Enhanced routes with metrics
app.get('/api/users', async (req, res) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  const dbStart = Date.now();
  
  try {
    // Check if database is available
    if (!pool) {
      end({ method: req.method, route: '/api/users', code: 503 });
      return res.status(503).json({ error: 'Database not available' });
    }

    const cacheKey = 'users:all';
    
    // Check Redis cache first (if available)
    if (redisClient && redisClient.isOpen) {
      try {
        const cachedUsers = await redisClient.get(cacheKey);
        if (cachedUsers) {
          console.log('Serving from cache');
          end({ method: req.method, route: '/api/users', code: 200 });
          databaseQueryDuration.observe({ operation: 'cache_hit', table: 'users' }, Date.now() - dbStart);
          return res.json(JSON.parse(cachedUsers));
        }
      } catch (redisError) {
        console.log('Redis cache error, falling back to database:', redisError.message);
      }
    }

    // If not in cache or Redis unavailable, query database
    const result = await pool.query('SELECT * FROM users ORDER BY id');
    
    // Store in Redis cache for 5 minutes (if available)
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.setEx(cacheKey, 300, JSON.stringify(result.rows));
      } catch (redisError) {
        console.log('Failed to cache in Redis:', redisError.message);
      }
    }
    
    console.log('Serving from database');
    databaseQueryDuration.observe({ operation: 'select', table: 'users' }, Date.now() - dbStart);
    end({ method: req.method, route: '/api/users', code: 200 });
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    end({ method: req.method, route: '/api/users', code: 500 });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, starting graceful shutdown...');
  
  if (pool) {
    await pool.end();
    console.log('✅ Database connection closed');
  }
  
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    console.log('✅ Redis connection closed');
  }
  
  process.exit(0);
});

// Initialize connections and start server
initializeConnections().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`📊 Metrics available at http://localhost:${PORT}/metrics`);
    console.log(`❤️  Health check at http://localhost:${PORT}/health`);
    console.log(`✅ Readiness check at http://localhost:${PORT}/ready`);
    console.log(`🔍 Detailed health at http://localhost:${PORT}/api/health`);
  });
}).catch(error => {
  console.error('💥 Failed to start server:', error);
  process.exit(1);
});