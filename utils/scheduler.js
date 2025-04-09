/**
 * Scheduler Utility
 * Provides methods for scheduling recurring tasks
 */
const openaiUtils = require('./openai');
const ollamaUtils = require('./ollama');
const redisClient = require('./redis').client;

// Constants for Redis keys to match settings.js
const LLM_PROVIDER_REDIS_KEY = 'settings:llm:provider';

// Track if the APIs are currently accessible
let openaiApiAccessible = false;
let ollamaApiAccessible = false;
// Track the timestamp of the last checks
let lastOpenAiCheckTime = null;
let lastOllamaCheckTime = null;

/**
 * Schedule recurring API status checks
 * @param {number} intervalMinutes - Interval in minutes between checks
 */
const scheduleApiChecks = (intervalMinutes = 60) => {
  // Convert minutes to milliseconds
  const interval = intervalMinutes * 60 * 1000;
  
  // Run initial checks immediately
  checkApiStatus();
  
  // Schedule recurring checks
  setInterval(async () => {
    await checkApiStatus();
  }, interval);
  
  console.log(`Scheduled LLM API status checks to run every ${intervalMinutes} minutes`);
};

/**
 * Check OpenAI API status and log the result
 * @returns {Promise<boolean>} API accessibility status
 */
const checkOpenAiStatus = async () => {
  try {
    lastOpenAiCheckTime = new Date().toISOString();
    openaiApiAccessible = await openaiUtils.checkStatus();
    
    if (openaiApiAccessible) {
      console.log('OpenAI API is accessible');
    } else {
      console.error('OpenAI API is NOT accessible');
    }
    
    return openaiApiAccessible;
  } catch (error) {
    console.error('Error checking OpenAI API status:', error);
    openaiApiAccessible = false;
    return false;
  }
};

/**
 * Check Ollama API status and log the result
 * @returns {Promise<boolean>} API accessibility status
 */
const checkOllamaStatus = async () => {
  try {
    lastOllamaCheckTime = new Date().toISOString();
    ollamaApiAccessible = await ollamaUtils.checkStatus();
    
    if (ollamaApiAccessible) {
      console.log('Ollama API is accessible');
    } else {
      console.error('Ollama API is NOT accessible');
    }
    
    return ollamaApiAccessible;
  } catch (error) {
    console.error('Error checking Ollama API status:', error);
    ollamaApiAccessible = false;
    return false;
  }
};

/**
 * Check API status based on currently selected LLM provider
 * @returns {Promise<Object>} Status information for both providers
 */
const checkApiStatus = async () => {
  try {
    // Get the current LLM provider from Redis
    let currentProvider = 'openai'; // Default if not set
    
    try {
      const provider = await redisClient.get(LLM_PROVIDER_REDIS_KEY);
      if (provider) {
        currentProvider = provider;
      }
    } catch (redisError) {
      console.error('Error getting LLM provider from Redis:', redisError);
    }
    
    console.log(`Current LLM provider: ${currentProvider}`);
    
    // Always check both APIs to maintain status awareness
    await checkOpenAiStatus();
    await checkOllamaStatus();
    
    return {
      openai: openaiApiAccessible,
      ollama: ollamaApiAccessible,
      currentProvider
    };
  } catch (error) {
    console.error('Error in checkApiStatus:', error);
    return {
      openai: openaiApiAccessible,
      ollama: ollamaApiAccessible,
      error: error.message
    };
  }
};

/**
 * Get current LLM API status information
 * @returns {Promise<Object>} Status information for both LLM providers
 */
const getLlmStatusInfo = async () => {
  // Get current LLM provider
  let currentProvider = 'openai'; // Default
  
  try {
    const provider = await redisClient.get(LLM_PROVIDER_REDIS_KEY);
    if (provider) {
      currentProvider = provider;
      console.log(`Current LLM provider from Redis: ${currentProvider}`);
    }
  } catch (error) {
    console.error('Error getting LLM provider in status info:', error);
  }
  
  return {
    openai: {
      accessible: openaiApiAccessible,
      lastChecked: lastOpenAiCheckTime
    },
    ollama: {
      accessible: ollamaApiAccessible,
      lastChecked: lastOllamaCheckTime
    },
    currentProvider
  };
};

module.exports = {
  scheduleApiChecks,
  checkApiStatus,
  checkOpenAiStatus,
  checkOllamaStatus,
  getLlmStatusInfo
};
