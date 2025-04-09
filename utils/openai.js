/**
 * OpenAI API Utility
 * Provides methods for interacting with the OpenAI API
 */
const { Configuration, OpenAIApi } = require('openai');
const redisUtil = require('./redis');
const redisClient = redisUtil.client;

// Redis key constants
const OPENAI_API_KEY_REDIS_KEY = 'settings:openai:api_key';

// Flag to ensure we only log the API key message once per server startup
let apiKeyMessageLogged = false;

// Function to get API key from Redis or environment variables
const getApiKey = async () => {
  try {
    // First try to get from Redis
    const redisApiKey = await redisClient.get(OPENAI_API_KEY_REDIS_KEY);
    
    if (redisApiKey && redisApiKey.length > 0) {
      if (!apiKeyMessageLogged) {
        console.log('Successfully loaded OpenAI API key from Redis settings');
        apiKeyMessageLogged = true;
      }
      return redisApiKey;
    }
    
    // If not in Redis, check environment variables
    const envApiKey = process.env.OPENAI_API_KEY || process.env.API_KEY || '';
    
    if (!envApiKey) {
      console.warn('OpenAI API key not found in Redis or environment variables');
    } else if (!apiKeyMessageLogged) {
      // Only log this message once per server startup
      console.log('Successfully loaded OpenAI API key from environment variables');
      apiKeyMessageLogged = true;
    }
    
    return envApiKey;
  } catch (error) {
    console.error('Error retrieving API key from Redis:', error);
    // Fall back to environment variables
    return process.env.OPENAI_API_KEY || process.env.API_KEY || '';
  }
};

// Synchronous version for immediate initialization
const getApiKeySync = () => {
  // For initial setup, we can only use environment variables
  // Later calls will use getApiKey() which checks Redis first
  return process.env.OPENAI_API_KEY || process.env.API_KEY || '';
};

// Create a configuration with the API key
let configuration = new Configuration({
  apiKey: getApiKeySync(), // Use sync version for initial setup
});

// Create an OpenAI API client
let openai = new OpenAIApi(configuration);

// Function to refresh the API client with a new key
const refreshClient = async () => {
  try {
    const apiKey = await getApiKey();
    configuration = new Configuration({ apiKey });
    openai = new OpenAIApi(configuration);
    return true;
  } catch (error) {
    console.error('Error refreshing OpenAI client:', error);
    return false;
  }
};

/**
 * Check if the OpenAI API is accessible
 * @returns {Promise<boolean>} true if connected, false otherwise
 */
const checkStatus = async () => {
  try {
    // Refresh the client to ensure we have the latest API key
    await refreshClient();
    
    // First check if we have an API key
    const apiKey = await getApiKey();
    if (!apiKey) {
      console.error('OpenAI status check failed: No API key provided');
      return false;
    }
    
    // Use a lightweight models list call to check connectivity
    await openai.listModels();
    return true;
  } catch (error) {
    console.error('OpenAI connection error:', error.message);
    // More detailed error information
    if (error.response) {
      // The request was made, but the API returned an error status code
      console.error(`API error status: ${error.response.status}`);
      console.error(`API error details: ${JSON.stringify(error.response.data)}`);
      
      // Check for specific error types
      if (error.response.status === 401) {
        console.error('Authentication error: API key is invalid or missing');
      } else if (error.response.status === 429) {
        console.error('Rate limit exceeded: Too many requests');
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from OpenAI API');
    }
    return false;
  }
};

// Store recent API events for monitoring
const apiEvents = [];
const MAX_EVENTS = 50; // Maximum number of events to keep

/**
 * Add an event to the API events log
 * @param {string} type - Type of event (request or response)
 * @param {object} data - Event data
 */
const logApiEvent = (type, data) => {
  // Create event object with timestamp
  const event = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    type,
    data: typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data
  };
  
  // Add to beginning of array (newest first)
  apiEvents.unshift(event);
  
  // Trim array to maximum size
  if (apiEvents.length > MAX_EVENTS) {
    apiEvents.length = MAX_EVENTS;
  }
  
  // Log to console for debugging
  console.log(`OpenAI API ${type}:`, 
    type === 'request' ? 
      `Model: ${data.model}, Prompt: ${data.prompt?.substring(0, 50)}...` : 
      `Response received, tokens: ${data.usage?.total_tokens || 'N/A'}`
  );
};

/**
 * Get all logged API events
 * @returns {Array} - Array of API events
 */
const getApiEvents = () => apiEvents;

/**
 * Get a completion from the OpenAI API
 * @param {string} prompt - The prompt to send to the API
 * @param {string} model - The model to use (default: gpt-3.5-turbo)
 * @param {number} maxTokens - Maximum number of tokens to generate
 * @returns {Promise<Object>} - The API response
 */
const getCompletion = async (prompt, model = 'gpt-3.5-turbo', maxTokens = 100) => {
  try {
    // Refresh the client to ensure we have the latest API key
    await refreshClient();

    let requestParams;
    let response;
    
    // For chat models
    if (model.includes('gpt-3.5') || model.includes('gpt-4')) {
      requestParams = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
      };
      
      // Log request event
      logApiEvent('request', {
        model,
        prompt,
        maxTokens,
        type: 'chat',
        timestamp: new Date().toISOString()
      });
      
      response = await openai.createChatCompletion(requestParams);
    } 
    // For older completion models
    else {
      requestParams = {
        model: model,
        prompt: prompt,
        max_tokens: maxTokens,
      };
      
      // Log request event
      logApiEvent('request', {
        model,
        prompt,
        maxTokens,
        type: 'completion',
        timestamp: new Date().toISOString()
      });
      
      response = await openai.createCompletion(requestParams);
    }
    
    // Log response event
    logApiEvent('response', response.data);
    
    return response.data;
  } catch (error) {
    // Log error event
    logApiEvent('error', {
      message: error.message,
      code: error.response?.status,
      details: error.response?.data
    });
    
    console.error('Error fetching from OpenAI API:', error.message);
    throw error;
  }
};

module.exports = {
  openai,
  checkStatus,
  getCompletion,
  getApiKey,
  getApiEvents,
  logApiEvent,
  refreshClient
};
