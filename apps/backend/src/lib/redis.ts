import "dotenv/config";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

const redis = redisUrl 
  ? new Redis(redisUrl, { 
      maxRetriesPerRequest: null,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 50, 2000)) 
    }) 
  : null;

if (redis) {
  redis.on('error', (err) => {
    console.warn('Redis connection issue:', err.message);
  });
}

export default redis;
