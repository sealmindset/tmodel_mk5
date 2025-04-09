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

// Helper functions for Redis keys
const getRedisValue = async (key, defaultValue = null) => {
  try {
    if (!client.isOpen) {
      await client.connect();
    }
    
    const value = await client.get(key);
    if (value === null && defaultValue !== null) {
      console.log(`Redis key '${key}' not found, using default value: ${defaultValue}`);
      // Store the default value for future use
      await client.set(key, defaultValue);
      return defaultValue;
    }
    return value;
  } catch (error) {
    console.error(`Error getting Redis value for key '${key}':`, error);
    return defaultValue;
  }
};

const storeRedisValue = async (key, value) => {
  try {
    if (!client.isOpen) {
      await client.connect();
    }
    
    await client.set(key, value);
    console.log(`Stored value in Redis: ${key} = ${value}`);
    return true;
  } catch (error) {
    console.error(`Error storing Redis value for key '${key}':`, error);
    return false;
  }
};

// Function to initialize necessary default settings
const initializeDefaultSettings = async () => {
  try {
    // Define default settings keys
    const defaultSettings = {
      'settings:llm:provider': 'openai',
      'settings:api:openai:model': 'gpt-3.5-turbo',
      'settings:api:ollama:model': 'llama3.3'
    };
    
    console.log('Initializing default LLM settings...');
    
    // For each setting, check if it exists and set default if not
    for (const [key, defaultValue] of Object.entries(defaultSettings)) {
      const value = await client.get(key);
      if (value === null) {
        await client.set(key, defaultValue);
        console.log(`Initialized default setting: ${key} = ${defaultValue}`);
      } else {
        console.log(`Existing setting found: ${key} = ${value}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error initializing default settings:', error);
    return false;
  }
};

// Export the client and functions
module.exports = {
  client,
  connect,
  getRedisValue,
  storeRedisValue,
  initializeDefaultSettings
};
