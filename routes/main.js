const express = require('express');
const router = express.Router();
const path = require('path');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

// Import ensureAuthenticated from app.js instead of directly from auth
// We'll pass this middleware via app.locals when registering routes

// Redis client setup
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

const client = redis.createClient({
  socket: {
    host: redisHost,
    port: redisPort,
  },
  password: process.env.REDIS_PASSWORD,
});

client.on('error', (err) => {
  console.error('Redis error in routes/main.js: ', err);
});

client.connect().catch(console.error);

// Dashboard (now the index route)
router.get('/', async (req, res) => {
  try {
    // Get stats for dashboard
    const stats = {
      totalModels: await getTotalModelCount(),
      totalReports: await getTotalReportCount(),
      avgThreatsPerModel: await getAverageThreatsPerModel(),
      modelsByMonth: await getModelsByMonth(),
      topThreatCategories: await getTopThreatCategories()
    };
    
    // Get recent activity
    const recentActivity = await getRecentActivity(10);

    res.render('dashboard', {
      user: req.session.username,
      stats,
      recentActivity
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).send('Error loading dashboard.');
  }
});

// Import needed utilities
const openaiUtil = require('../utils/openai');
const ollamaUtil = require('../utils/ollama');

// Constants for Redis keys to match settings.js
const OPENAI_MODEL_REDIS_KEY = 'settings:openai:model';
const LLM_PROVIDER_REDIS_KEY = 'settings:llm:provider';
const OLLAMA_MODEL_REDIS_KEY = 'settings:ollama:model';

// Helper function to get a Redis value
async function getRedisValue(key, defaultValue = null) {
  try {
    const value = await client.get(key);
    return value || defaultValue;
  } catch (error) {
    console.error(`Error retrieving value for ${key}:`, error);
    return defaultValue;
  }
}

// Create new threat model page
router.get('/create', async (req, res) => {
  try {
    // Get LLM provider settings from Redis
    const llmProvider = await getRedisValue(LLM_PROVIDER_REDIS_KEY, 'openai');
    const openaiModel = await getRedisValue(OPENAI_MODEL_REDIS_KEY, 'gpt-3.5-turbo');
    const ollamaModel = await getRedisValue(OLLAMA_MODEL_REDIS_KEY, 'llama3.3');
    
    console.log('LLM Provider from Redis:', llmProvider);
    console.log('OpenAI Model from Redis:', openaiModel);
    console.log('Ollama Model from Redis:', ollamaModel);
    
    // Initialize available Ollama models
    let availableOllamaModels = [{ name: ollamaModel }];
    
    // If Ollama is the provider, try to get available models
    if (llmProvider === 'ollama') {
      try {
        const ollamaStatus = await ollamaUtil.checkStatus();
        if (ollamaStatus) {
          availableOllamaModels = await ollamaUtil.getModels();
          
          // Make sure our selected model is in the list
          const modelExists = availableOllamaModels.some(model => model.name === ollamaModel);
          if (!modelExists && ollamaModel) {
            // Add our selected model to the list if it's not there
            availableOllamaModels.push({ name: ollamaModel });
          }
          
          // Add llama3.3 if it's not in the list
          const llama3Exists = availableOllamaModels.some(model => model.name === 'llama3.3' || model.name === 'llama3.3:latest');
          if (!llama3Exists) {
            availableOllamaModels.push({ name: 'llama3.3:latest' });
          }
          
          if (availableOllamaModels.length === 0) {
            // Fallback if no models are found
            availableOllamaModels = [{ name: ollamaModel || 'llama3.3:latest' }];
          }
          
          console.log('Available Ollama models:', availableOllamaModels.map(m => m.name).join(', '));
        }
      } catch (err) {
        console.error('Error fetching Ollama models:', err);
      }
    }
    
    res.render('create', {
      user: req.session.username,
      error: null,
      success: null,
      llmProvider,
      openaiModel,
      ollamaModel,
      availableOllamaModels
    });
  } catch (error) {
    console.error('Error loading create page:', error);
    res.status(500).send('Error loading create page.');
  }
});

// Helper functions for statistics
async function getTotalModelCount() {
  const keys = await client.keys('subject:*:title');
  return keys.length;
}

async function getTotalReportCount() {
  const keys = await client.keys('reports:*:reporttitle');
  return keys.length;
}

async function getAverageThreatsPerModel() {
  // This is a placeholder. In a real implementation, you would count
  // the number of threats across all models and divide by the model count.
  return 5.8; // Example value
}

async function getModelsByMonth() {
  // This is now returning operating environments instead of months
  // In a real implementation, you would aggregate models by environment
  return [
    { month: 'AWS', count: 24 },
    { month: 'Azure', count: 19 },
    { month: 'GCP', count: 15 },
    { month: 'Data Center', count: 12 },
    { month: 'OCI', count: 8 },
    { month: 'Other', count: 5 }
  ];
}

async function getTopThreatCategories() {
  // This is a placeholder. In a real implementation, you would count
  // threat categories across all models.
  return [
    { category: 'Injection', count: 18 },
    { category: 'Authentication', count: 15 },
    { category: 'XSS', count: 12 },
    { category: 'Access Control', count: 10 },
    { category: 'Data Exposure', count: 8 }
  ];
}

async function getRecentActivity(limit = 5) {
  // This is a placeholder. In a real implementation, you would fetch
  // recent model and report creations.
  return [
    {
      type: 'create_model',
      title: 'Banking Application',
      link: '/results?subjectid=123',
      date: new Date(Date.now() - 3600000).toISOString()
    },
    {
      type: 'create_report',
      title: 'Healthcare API',
      link: '/reports/456',
      date: new Date(Date.now() - 7200000).toISOString()
    },
    {
      type: 'view_model',
      title: 'E-Commerce Platform',
      link: '/results?subjectid=789',
      date: new Date(Date.now() - 10800000).toISOString()
    }
  ];
}

// List all threat models
router.get('/prompts', async (req, res) => {
  try {
    // Get all prompt keys from Redis
    const promptKeys = await client.keys('prompt:*:title');
    
    // Create a list of promises to fetch prompt details
    const promptsPromises = promptKeys.map(async (key) => {
      // Extract prompt ID from the key pattern prompt:$id:title
      const id = key.split(':')[1];
      
      // Get prompt title
      const title = await client.get(key);
      
      // Get creation timestamp
      const createdAt = await client.get(`prompt:${id}:createdAt`) || new Date().toISOString();
      
      return {
        id,
        title,
        createdAt
      };
    });
    
    // Resolve all promises to get prompt details
    let prompts = await Promise.all(promptsPromises);
    
    // Sort by creation date (newest first)
    prompts = prompts.sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    res.render('prompts', {
      user: req.session.username,
      prompts,
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.render('prompts', {
      user: req.session.username,
      prompts: [],
      error: 'Failed to load prompts',
      success: null
    });
  }
});

// API endpoint to get all prompts
router.get('/api/prompts', async (req, res) => {
  try {
    // Get all prompt keys from Redis
    const promptKeys = await client.keys('prompt:*:title');
    
    // Create a list of promises to fetch prompt details
    const promptsPromises = promptKeys.map(async (key) => {
      // Extract prompt ID from the key pattern prompt:$id:title
      const id = key.split(':')[1];
      
      // Get prompt title and text
      const title = await client.get(key);
      const text = await client.get(`prompt:${id}:text`);
      const prompttext = await client.get(`prompt:${id}:prompttext`);
      const createdAt = await client.get(`prompt:${id}:createdAt`) || new Date().toISOString();
      
      return {
        id,
        title,
        text: text || prompttext, // Use text if available, otherwise fallback to prompttext
        prompttext: prompttext || text, // Support both formats
        createdAt
      };
    });
    
    // Resolve all promises to get prompt details
    let prompts = await Promise.all(promptsPromises);
    
    // Sort by creation date (newest first)
    prompts = prompts.sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    res.json({ success: true, prompts });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// API endpoint to get a specific prompt
router.get('/api/prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get prompt details
    const title = await client.get(`prompt:${id}:title`);
    const text = await client.get(`prompt:${id}:text`);
    const prompttext = await client.get(`prompt:${id}:prompttext`);
    
    if (!title || (!text && !prompttext)) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    res.json({
      success: true,
      prompt: {
        id,
        title,
        text: text || prompttext,
        prompttext: prompttext || text
      }
    });
  } catch (error) {
    console.error('Error fetching prompt:', error);
    res.status(500).json({ error: 'Failed to fetch prompt' });
  }
});

// API endpoint to create a new prompt
router.post('/api/prompts', async (req, res) => {
  try {
    const { title, text } = req.body;
    
    if (!title || !text) {
      return res.status(400).json({ error: 'Title and text are required' });
    }
    
    // Generate a unique ID
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    
    // Save prompt to Redis
    await client.set(`prompt:${id}:title`, title);
    await client.set(`prompt:${id}:text`, text);
    await client.set(`prompt:${id}:prompttext`, text); // For backward compatibility
    await client.set(`prompt:${id}:createdAt`, createdAt);
    
    res.status(201).json({
      success: true,
      prompt: {
        id,
        title,
        prompttext: text,
        createdAt
      }
    });
  } catch (error) {
    console.error('Error creating prompt:', error);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// API endpoint to update a prompt
router.put('/api/prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, text } = req.body;
    
    if (!title || !text) {
      return res.status(400).json({ error: 'Title and text are required' });
    }
    
    // Check if prompt exists
    const exists = await client.exists(`prompt:${id}:title`);
    
    if (!exists) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    // Update prompt in Redis
    await client.set(`prompt:${id}:title`, title);
    await client.set(`prompt:${id}:text`, text);
    await client.set(`prompt:${id}:prompttext`, text); // For backward compatibility
    
    res.json({
      success: true,
      prompt: {
        id,
        title,
        prompttext: text
      }
    });
  } catch (error) {
    console.error('Error updating prompt:', error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// API endpoint to delete prompts
router.post('/api/delete-prompts', async (req, res) => {
  try {
    const { promptsToDelete } = req.body;
    
    if (!promptsToDelete || !Array.isArray(promptsToDelete) || promptsToDelete.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty prompts list' });
    }
    
    // Create a list of promises to delete prompts
    const deletePromises = promptsToDelete.flatMap(id => [
      client.del(`prompt:${id}:title`),
      client.del(`prompt:${id}:text`),
      client.del(`prompt:${id}:createdAt`)
    ]);
    
    // Execute all delete operations
    await Promise.all(deletePromises);
    
    res.json({ success: true, message: 'Prompts deleted successfully' });
  } catch (error) {
    console.error('Error deleting prompts:', error);
    res.status(500).json({ error: 'Failed to delete prompts' });
  }
});

// API endpoint to delete a prompt
router.delete('/api/prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if prompt exists
    const exists = await client.exists(`prompt:${id}:title`);
    
    if (!exists) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    // Delete prompt from Redis
    await client.del(`prompt:${id}:title`);
    await client.del(`prompt:${id}:text`);
    await client.del(`prompt:${id}:prompttext`); // Delete prompttext field too
    await client.del(`prompt:${id}:createdAt`);
    
    res.json({ success: true, message: 'Prompt deleted successfully' });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});



// API endpoint to export prompts
router.post('/api/export-prompts', async (req, res) => {
  try {
    const { promptIds } = req.body;
    
    if (!promptIds || !Array.isArray(promptIds) || promptIds.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty prompts list' });
    }
    
    // Create a list of promises to fetch prompt details
    const promptsPromises = promptIds.map(async (id) => {
      // Get prompt details
      const title = await client.get(`prompt:${id}:title`);
      const text = await client.get(`prompt:${id}:text`);
      const createdAt = await client.get(`prompt:${id}:createdAt`) || new Date().toISOString();
      
      if (!title || !text) return null;
      
      return {
        id,
        title,
        text,
        createdAt
      };
    });
    
    // Resolve all promises and filter out null values (non-existent prompts)
    let prompts = (await Promise.all(promptsPromises)).filter(Boolean);
    
    // Set response headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=prompt-templates.json');
    
    // Send the prompts as a JSON file
    res.json({ prompts });
  } catch (error) {
    console.error('Error exporting prompts:', error);
    res.status(500).json({ error: 'Failed to export prompts' });
  }
});

router.get('/models', async (req, res) => {
  try {
    // Get all subject keys from Redis
    const subjectKeys = await client.keys('subject:*:title');
    
    // Create a list of promises to fetch subject details
    const subjectsPromises = subjectKeys.map(async (key) => {
      // Extract subject ID from the key pattern subject:$id:title
      const subjectid = key.split(':')[1];
      
      // Get subject title
      const title = await client.get(key);
      
      // Get model used (if available)
      const model = await client.get(`subject:${subjectid}:model`) || 'Unknown';
      
      // Get creation date (if available)
      let createdAt;
      try {
        createdAt = await client.get(`subject:${subjectid}:createdAt`);
        if (!createdAt) {
          // If no creation date is stored, use current time
          createdAt = new Date().toISOString();
        }
      } catch (err) {
        createdAt = new Date().toISOString();
      }

      // Get response text to count threats
      let threatCount = 0;
      try {
        const responseText = await client.get(`subject:${subjectid}:response`);
        if (responseText) {
          // Use the same pattern as the View Threats functionality
          const threatPattern = /## (.*?)\n/g;
          let match;
          let matches = [];
          
          // Count all matches of the pattern
          while ((match = threatPattern.exec(responseText)) !== null) {
            matches.push(match[1]);
          }
          
          threatCount = matches.length;
        }
      } catch (err) {
        console.error(`Error getting threat count for subject ${subjectid}:`, err);
      }
      
      return {
        subjectid,
        title,
        model,
        createdAt,
        threatCount
      };
    });
    
    // Resolve all promises to get subject details
    let subjects = await Promise.all(subjectsPromises);
    
    // Sort by creation date (newest first)
    subjects = subjects.sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    res.render('models', {
      user: req.session.username,
      subjects,
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Error loading models page:', error);
    res.status(500).send('Error loading models page.');
  }
});

module.exports = router;
