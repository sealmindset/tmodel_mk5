/**
 * API Routes for internal functionality
 */
const express = require('express');
const router = express.Router();

// Import dependencies
const redisUtil = require('../utils/redis');
const openaiUtil = require('../utils/openai');
const ollamaUtil = require('../utils/ollama');
const scheduler = require('../utils/scheduler');
const redisClient = redisUtil.client;

// Get auth middleware - try both possible locations
let ensureAuthenticated;
try {
  // First try to import from the root auth module
  ensureAuthenticated = require('../auth')(express()).ensureAuthenticated;
} catch (error) {
  console.log('Using direct middleware import for auth');
  // Fall back to middleware folder
  ensureAuthenticated = require('../middleware/auth').ensureAuthenticated;
}

// Get status of core services - no auth required for this route
router.get('/status', async (req, res) => {
  try {
    // Check which provider to test based on query parameter
    const provider = req.query.provider || 'all';
    const response = {
      timestamp: new Date().toISOString()
    };

    // Check Redis status (always check)
    let redisStatus = false;
    try {
      // Simple ping to check if Redis is alive
      await redisClient.ping();
      redisStatus = true;
    } catch (redisError) {
      console.error('Redis connection error:', redisError);
    }
    response.redis = redisStatus;

    // Get status info for all LLM providers
    const llmStatusInfo = await scheduler.getLlmStatusInfo();
    response.currentProvider = llmStatusInfo.currentProvider;
    
    // Check OpenAI status if requested or checking all
    if (provider === 'all' || provider === 'openai') {
      // Force a check if explicitly requested by query param
      if (req.query.forceCheck === 'true') {
        try {
          await scheduler.checkOpenAiStatus();
          // Get updated status after the check
          const updatedLlmStatusInfo = await scheduler.getLlmStatusInfo();
          llmStatusInfo.openai = updatedLlmStatusInfo.openai;
        } catch (checkError) {
          console.error('Error during forced OpenAI status check:', checkError);
        }
      }

      response.openai = llmStatusInfo.openai.accessible;
      response.openaiLastChecked = llmStatusInfo.openai.lastChecked;
    }

    // Check Ollama status if requested or checking all
    if (provider === 'all' || provider === 'ollama') {
      // Force a check if explicitly requested by query param
      if (req.query.forceCheck === 'true') {
        try {
          await scheduler.checkOllamaStatus();
          // Get updated status after the check
          const updatedLlmStatusInfo = await scheduler.getLlmStatusInfo();
          llmStatusInfo.ollama = updatedLlmStatusInfo.ollama;
        } catch (checkError) {
          console.error('Error during forced Ollama status check:', checkError);
        }
      } else if (!llmStatusInfo.ollama.lastChecked) {
        // If we don't have a cached status, check now
        try {
          await scheduler.checkOllamaStatus();
          const updatedLlmStatusInfo = await scheduler.getLlmStatusInfo();
          llmStatusInfo.ollama = updatedLlmStatusInfo.ollama;
        } catch (ollamaError) {
          console.error('Ollama connection error:', ollamaError);
        }
      }
      
      response.ollama = llmStatusInfo.ollama.accessible;
      response.ollamaLastChecked = llmStatusInfo.ollama.lastChecked;

      // If checking Ollama specifically, also include available models
      if (provider === 'ollama' && llmStatusInfo.ollama.accessible) {
        try {
          const ollamaModels = await ollamaUtil.getModels();
          response.ollamaModels = ollamaModels;
        } catch (modelError) {
          console.error('Error fetching Ollama models:', modelError);
        }
      }
    }
    
    // Return the combined status
    res.json(response);
  } catch (error) {
    console.error('Error checking service status:', error);
    res.status(500).json({ error: 'Failed to check service status' });
  }
});

// Example protected route
router.get('/protected-example', ensureAuthenticated, async (req, res) => {
  // This is a protected route example that requires authentication
  res.json({
    message: 'You have access to this protected route',
    user: req.session.user || 'Anonymous' 
  });
});

/**
 * @route GET /api/llm/events
 * @desc Get recent LLM API events for monitoring (OpenAI or Ollama)
 */
router.get('/llm/events', async (req, res) => {
  try {
    const provider = req.query.provider || 'openai';
    let events = [];
    
    if (provider === 'openai') {
      events = openaiUtil.getApiEvents();
    } else if (provider === 'ollama') {
      events = ollamaUtil.getApiEvents();
    } else {
      // If invalid provider, return empty array
      return res.status(400).json({ error: 'Invalid provider specified' });
    }
    
    res.json(events);
  } catch (error) {
    console.error(`Error retrieving ${req.query.provider || 'LLM'} API events:`, error);
    res.status(500).json({ error: `Error retrieving ${req.query.provider || 'LLM'} API events` });
  }
});

/**
 * @route GET /api/ollama/models
 * @desc Get list of available Ollama models
 */
router.get('/ollama/models', async (req, res) => {
  try {
    const models = await ollamaUtil.getModels();
    res.json(models);
  } catch (error) {
    console.error('Error retrieving Ollama models:', error);
    res.status(500).json({ error: 'Error retrieving Ollama models' });
  }
});

/**
 * @route GET /api/openai/events
 * @desc Get recent OpenAI API events for monitoring (legacy route)
 */
router.get('/openai/events', async (req, res) => {
  try {
    const events = openaiUtil.getApiEvents();
    res.json(events);
  } catch (error) {
    console.error('Error retrieving OpenAI API events:', error);
    res.status(500).json({ error: 'Error retrieving OpenAI API events' });
  }
});

module.exports = router;
