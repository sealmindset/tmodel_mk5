/**
 * Redis Client Utility
 * Provides a shared Redis client instance
 */
const redis = require('redis');

// Redis connection configuration from environment variables
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

// Create Redis client
const client = redis.createClient({
  socket: {
    host: redisHost,
    port: redisPort,
  },
  password: process.env.REDIS_PASSWORD || '',
});

// Handle Redis connection events
client.on('connect', () => {
  console.log('Redis client connected');
});

client.on('error', (err) => {
  console.error('Redis client error:', err);
});

// Export a connect function instead of auto-connecting
const connect = async () => {
  try {
    // Only connect if not already connected
    if (!client.isOpen) {
      await client.connect();
      console.log('Redis client connected');
    } else {
      console.log('Redis client already connected');
    }
    return true;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return false;
  }
};

// Export the client and connect function
module.exports = {
  client,
  connect
};
