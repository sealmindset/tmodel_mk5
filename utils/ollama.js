/**
 * Ollama API Utility
 * Provides methods for interacting with the local Ollama API
 */
const axios = require('axios');

// Default Ollama endpoint
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/api';

// Flag to ensure we only log the API status message once per server startup
let apiStatusMessageLogged = false;

// Store recent API events for monitoring
const apiEvents = [];
const MAX_EVENTS = 50; // Maximum number of events to keep

/**
 * Check if the Ollama API is accessible
 * @returns {Promise<boolean>} true if connected, false otherwise
 */
const checkStatus = async () => {
  try {
    // Use a lightweight models list call to check connectivity
    const response = await axios.get(`${OLLAMA_API_URL}/tags`);
    
    if (response.status === 200 && response.data && response.data.models) {
      if (!apiStatusMessageLogged) {
        console.log(`Successfully connected to Ollama API with ${response.data.models.length} models available`);
        apiStatusMessageLogged = true;
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('Ollama connection error:', error.message);
    // More detailed error information
    if (error.response) {
      console.error(`API error status: ${error.response.status}`);
      console.error(`API error details: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error('No response received from Ollama API');
    }
    return false;
  }
};

/**
 * Get list of available Ollama models
 * @returns {Promise<Array>} List of available models
 */
const getModels = async () => {
  try {
    const response = await axios.get(`${OLLAMA_API_URL}/tags`);
    if (response.status === 200 && response.data && response.data.models) {
      return response.data.models;
    }
    return [];
  } catch (error) {
    console.error('Error fetching Ollama models:', error.message);
    return [];
  }
};

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
  console.log(`Ollama API ${type}:`, 
    type === 'request' ? 
      `Model: ${data.model}, Prompt: ${data.prompt?.substring(0, 50)}...` : 
      `Response received`
  );
};

/**
 * Get all logged API events
 * @returns {Array} - Array of API events
 */
const getApiEvents = () => apiEvents;

/**
 * Get a completion from the Ollama API
 * @param {string} prompt - The prompt to send to the API
 * @param {string} model - The model to use (default: llama3.3)
 * @param {number} maxTokens - Maximum number of tokens to generate
 * @returns {Promise<Object>} - The API response
 */
const getCompletion = async (prompt, model = 'llama3.3', maxTokens = 100) => {
  try {
    // Prepare request parameters
    const requestParams = {
      model,
      prompt,
      max_tokens: maxTokens,
      stream: false
    };
    
    // Log request event
    logApiEvent('request', {
      model,
      prompt,
      maxTokens,
      timestamp: new Date().toISOString()
    });
    
    const response = await axios.post(`${OLLAMA_API_URL}/generate`, requestParams);
    console.log('Raw Ollama API response structure:', JSON.stringify(response.data).substring(0, 200));
    
    // Format response to match OpenAI structure
    const formattedResponse = {
      id: `ollama-${Date.now()}`,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        text: response.data.response,
        index: 0,
        finish_reason: 'stop'
      }],
      // Include the response directly on the object for app.js to find it
      response: response.data.response,
      usage: {
        prompt_tokens: prompt.length / 4, // Rough estimation
        completion_tokens: response.data.response.length / 4, // Rough estimation
        total_tokens: (prompt.length + response.data.response.length) / 4 // Rough estimation
      }
    };
    
    // Log response event
    logApiEvent('response', formattedResponse);
    
    return formattedResponse;
  } catch (error) {
    // Log error event
    logApiEvent('error', {
      message: error.message,
      code: error.response?.status,
      details: error.response?.data
    });
    
    console.error('Error fetching from Ollama API:', error.message);
    throw error;
  }
};

/**
 * Get a chat completion from the Ollama API
 * @param {Array} messages - Array of message objects with role and content
 * @param {string} model - The model to use (default: llama3.3)
 * @param {number} maxTokens - Maximum number of tokens to generate
 * @returns {Promise<Object>} - The API response formatted like OpenAI's
 */
const getChatCompletion = async (messages, model = 'llama3.3', maxTokens = 100) => {
  try {
    // Convert messages array to a prompt format that Ollama can understand
    const conversationText = messages.map(msg => {
      const role = msg.role === 'assistant' ? 'Assistant' : 'User';
      return `${role}: ${msg.content}`;
    }).join('\n\n');
    
    const finalPrompt = `${conversationText}\n\nAssistant:`;
    
    // Prepare request parameters
    const requestParams = {
      model,
      prompt: finalPrompt,
      max_tokens: maxTokens,
      stream: false
    };
    
    // Log request event
    logApiEvent('request', {
      model,
      messages,
      maxTokens,
      timestamp: new Date().toISOString()
    });
    
    const response = await axios.post(`${OLLAMA_API_URL}/generate`, requestParams);
    
    // Format response to match OpenAI chat structure
    const formattedResponse = {
      id: `ollama-chat-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        message: {
          role: 'assistant',
          content: response.data.response
        },
        index: 0,
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: finalPrompt.length / 4, // Rough estimation
        completion_tokens: response.data.response.length / 4, // Rough estimation
        total_tokens: (finalPrompt.length + response.data.response.length) / 4 // Rough estimation
      }
    };
    
    // Log response event
    logApiEvent('response', formattedResponse);
    
    return formattedResponse;
  } catch (error) {
    // Log error event
    logApiEvent('error', {
      message: error.message,
      code: error.response?.status,
      details: error.response?.data
    });
    
    console.error('Error fetching chat completion from Ollama API:', error.message);
    throw error;
  }
};

module.exports = {
  checkStatus,
  getCompletion,
  getChatCompletion,
  getModels,
  getApiEvents,
  logApiEvent
};
