/**
 * Settings Routes
 */
const express = require('express');
const router = express.Router();
const redisUtil = require('../utils/redis');
const openaiUtil = require('../utils/openai');
const ollamaUtil = require('../utils/ollama');
const redisClient = redisUtil.client;

// Import auth middleware
let ensureAuthenticated;
try {
  ensureAuthenticated = require('../auth')(express()).ensureAuthenticated;
} catch (error) {
  console.log('Using direct middleware import for auth');
  ensureAuthenticated = require('../middleware/auth').ensureAuthenticated;
}

// Constants for Redis keys
const OPENAI_API_KEY_REDIS_KEY = 'settings:openai:api_key';
const OPENAI_MODEL_REDIS_KEY = 'settings:openai:model';
const LLM_PROVIDER_REDIS_KEY = 'settings:llm:provider';
const OLLAMA_MODEL_REDIS_KEY = 'settings:ollama:model';

// Get API settings page
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // Get service status
    const redisStatus = await checkRedisStatus();
    const openaiStatus = await openaiUtil.checkStatus();
    let ollamaStatus = false;
    let availableOllamaModels = [];
    
    try {
      ollamaStatus = await ollamaUtil.checkStatus();
      if (ollamaStatus) {
        availableOllamaModels = await ollamaUtil.getModels();
      }
    } catch (err) {
      console.error('Error checking Ollama status:', err);
    }
    
    // Get stored settings
    let openaiApiKey = await getStoredOpenAIKey() || '';
    let openaiModel = await getRedisValue(OPENAI_MODEL_REDIS_KEY) || 'gpt-3.5-turbo';
    let llmProvider = await getRedisValue(LLM_PROVIDER_REDIS_KEY) || 'openai';
    let ollamaModel = await getRedisValue(OLLAMA_MODEL_REDIS_KEY) || 'llama3.3';
    
    // Ensure we have at least one model in the list
    if (availableOllamaModels.length === 0) {
      availableOllamaModels = [{ name: ollamaModel }];
    }
    
    // Mask the key for display
    if (openaiApiKey) {
      openaiApiKey = maskApiKey(openaiApiKey);
    }
    
    // Get any flash messages
    const message = req.session.message || null;
    delete req.session.message;
    
    res.render('api-settings', {
      openaiApiKey,
      openaiModel,
      openaiStatus,
      redisStatus,
      ollamaStatus,
      ollamaModel,
      llmProvider,
      availableOllamaModels,
      message
    });
  } catch (error) {
    console.error('Error loading API settings:', error);
    res.render('api-settings', {
      openaiApiKey: '',
      openaiStatus: false,
      redisStatus: false,
      message: {
        type: 'danger',
        text: 'Error loading settings: ' + error.message
      }
    });
  }
});

// Save API settings
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const { 
      openaiApiKey, 
      openaiModel = 'gpt-3.5-turbo',
      ollamaModel = 'llama3.3',
      llmProvider = 'openai'
    } = req.body;
    
    // Always store the selected LLM provider and models
    await storeRedisValue(LLM_PROVIDER_REDIS_KEY, llmProvider);
    await storeRedisValue(OPENAI_MODEL_REDIS_KEY, openaiModel);
    await storeRedisValue(OLLAMA_MODEL_REDIS_KEY, ollamaModel);
    
    // Set the current values in the process environment
    process.env.LLM_PROVIDER = llmProvider;
    process.env.OPENAI_MODEL = openaiModel;
    process.env.OLLAMA_MODEL = ollamaModel;
    
    // Success message
    let successMessage = 'LLM settings saved successfully.';
    
    // Handle OpenAI-specific settings
    if (llmProvider === 'openai') {
      let currentApiKey = await getStoredOpenAIKey();
      let apiKeyMessage = null;
      
      // If API key field was provided in the form
      if (typeof openaiApiKey !== 'undefined') {
        // If non-empty API key provided, store it
        if (openaiApiKey && openaiApiKey.trim() !== '') {
          // Store the provided API key in Redis
          await storeOpenAIKey(openaiApiKey);
          
          // Set it as the current API key
          process.env.OPENAI_API_KEY = openaiApiKey;
          
          // Update current API key reference
          currentApiKey = openaiApiKey;
        } else if (openaiApiKey.trim() === '') {
          // If empty key provided (user cleared the field), keep using .env 
          // but clear the stored Redis key
          await storeOpenAIKey('');
          delete process.env.OPENAI_API_KEY;
          currentApiKey = process.env.OPENAI_API_KEY || '';
          
          // Inform user we're fallback to .env
          apiKeyMessage = {
            type: 'info',
            text: 'API key cleared from settings. Using API key from .env file if available.'
          };
        }
      }
      
      // Test the connection regardless of where the key comes from
      const openaiStatus = await openaiUtil.checkStatus();
      
      if (openaiStatus) {
        successMessage += ' OpenAI connection verified.';
        
        // If we have a specific message about the API key, show that instead
        if (apiKeyMessage) {
          req.session.message = {
            type: apiKeyMessage.type,
            text: apiKeyMessage.text + ' Connection successful!'
          };
          res.redirect('/api-settings');
          return;
        }
      } else {
        // Connection failed
        if (!currentApiKey) {
          req.session.message = {
            type: 'warning',
            text: 'No OpenAI API key found in settings or environment variables. This is required for OpenAI provider.'
          };
        } else {
          req.session.message = {
            type: 'warning',
            text: 'Settings saved but OpenAI connection test failed. Check your API key.'
          };
        }
        res.redirect('/api-settings');
        return;
      }
    }
    
    // Handle Ollama-specific settings  
    if (llmProvider === 'ollama') {
      // Test the Ollama connection
      const ollamaStatus = await ollamaUtil.checkStatus();
      
      if (ollamaStatus) {
        // Check if the specified model exists
        const models = await ollamaUtil.getModels();
        const modelExists = models.some(model => model.name === ollamaModel);
        
        if (!modelExists) {
          req.session.message = {
            type: 'warning',
            text: `Settings saved but model '${ollamaModel}' was not found in Ollama. You may need to pull it first.`
          };
          res.redirect('/api-settings');
          return;
        }
        
        successMessage += ' Ollama connection verified.';
      } else {
        req.session.message = {
          type: 'warning',
          text: 'Settings saved but Ollama connection failed. Is Ollama running?'
        };
        res.redirect('/api-settings');
        return;
      }
    }
    
    res.redirect('/api-settings');
  } catch (error) {
    console.error('Error saving API settings:', error);
    req.session.message = {
      type: 'danger',
      text: 'Error saving settings: ' + error.message
    };
    res.redirect('/api-settings');
    return;
  }
  
  // If we got here, all settings were saved successfully
  req.session.message = {
    type: 'success',
    text: 'Settings saved successfully.'
  };
  res.redirect('/api-settings');
});

// Helper function to check Redis status
async function checkRedisStatus() {
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error('Redis status check failed:', error);
    return false;
  }
}

// Helper function to retrieve the stored OpenAI API key
async function getStoredOpenAIKey() {
  try {
    return await redisClient.get(OPENAI_API_KEY_REDIS_KEY);
  } catch (error) {
    console.error('Error retrieving OpenAI API key:', error);
    return null;
  }
}

// Helper function to store the OpenAI API key
async function storeOpenAIKey(apiKey) {
  try {
    await redisClient.set(OPENAI_API_KEY_REDIS_KEY, apiKey);
    return true;
  } catch (error) {
    console.error('Error storing OpenAI API key:', error);
    throw error;
  }
}

// Generic helper function to get a value from Redis
async function getRedisValue(key) {
  try {
    return await redisClient.get(key);
  } catch (error) {
    console.error(`Error retrieving value for ${key}:`, error);
    return null;
  }
}

// Generic helper function to store a value in Redis
async function storeRedisValue(key, value) {
  try {
    await redisClient.set(key, value);
    return true;
  } catch (error) {
    console.error(`Error storing value for ${key}:`, error);
    throw error;
  }
}

// Helper function to mask an API key for display
function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 8) return '';
  
  // Show only first 4 and last 4 characters
  return `${apiKey.substring(0, 4)}${'*'.repeat(apiKey.length - 8)}${apiKey.substring(apiKey.length - 4)}`;
}

module.exports = router;
