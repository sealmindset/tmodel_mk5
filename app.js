// Load environment variables from .env file if it exists
try {
  require('dotenv').config();
  console.log('Loaded environment variables from .env file');
} catch (err) {
  console.log('No .env file found, using default values');
}

const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ThreatAnalyzer = require('./threatAnalyzer');
const naturalCompare = require('natural-compare');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const scheduler = require('./utils/scheduler');

// For SSE (Server-Sent Events)
const { v4: uuidv4 } = require('uuid');

// Map to store active LLM requests and their status
const activeLLMRequests = new Map();

const app = express();
const port = process.env.PORT || 3000;

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

const cors = require('cors');
app.use(
  cors({
    origin: 'https://tmodeling.onrender.com',
    credentials: true,
  })
);

console.log('Environment Variables:');
console.log(`REDIS_HOST: ${redisHost}`);
console.log(`REDIS_PORT: ${redisPort}`);
console.log(`PORT: ${port}`);

// Import Redis utility
const redisUtil = require('./utils/redis');
const client = redisUtil.client;
const { getRedisValue, storeRedisValue, initializeDefaultSettings } = redisUtil;

const createRweHash = async (rweid, threat, description, reference) => {
  const hashKey = `rwe:${rweid}`;
  await client.hSet(hashKey, {
    threat,
    description,
    reference,
  });
};

client.on('error', (err) => {
  console.error('Redis error: ', err);
});

client
  .connect()
  .then(() => {
    console.log('Connected to Redis successfully!');
    // Initialize the threat analyzer
    app.locals.threatAnalyzer = new ThreatAnalyzer(client);
  })
  .catch(console.error);

app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));

// Configure multer for memory storage (no file writing)
const upload = multer({ storage: multer.memoryStorage() });
app.set('view engine', 'ejs');
app.use(express.static('public'));

// API endpoint for debug info moved after ensureAuthenticated is defined

// Session setup with RedisStore
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-key-change-in-production';
console.log('Using session secret:', sessionSecret ? 'Configured' : 'Not configured');

app.use(
  session({
    store: new RedisStore({ client }),
    secret: sessionSecret,
    resave: true,
    saveUninitialized: true,
    name: 'tmodel.sid',
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      sameSite: 'lax'
    },
  })
);

// Initialize Redis connection
(async () => {
  try {
    // Configure Redis session store
    console.log('Redis session store configured');
    
    // Connect to Redis (only connects if not already connected)
    const connected = await redisUtil.connect();
    
    if (connected) {
      console.log('Connected to Redis successfully!');
    } else {
      console.error('Failed to connect to Redis');
    }
  } catch (error) {
    console.error('Error initializing Redis:', error);
  }
})();

// Load authentication module and get middleware
const { ensureAuthenticated } = require('./auth')(app);

// Import routes
const mainRoutes = require('./routes/main');
const apiRoutes = require('./routes/api');
const settingsRoutes = require('./routes/settings');




// Register routes with authentication

app.use('/', ensureAuthenticated, mainRoutes);
app.use('/api', apiRoutes);
app.use('/api-settings', settingsRoutes);




// Main page route is now handled in routes/main.js

// Utility functions to interact with Redis
const getAllSubjectsWithTitles = async () => {
  try {
    const keys = await client.keys('subject:*:title');
    const subjects = keys.map((key) => key.split(':')[1]);
    const titlesPromises = keys.map((key) => client.get(key));
    const titles = await Promise.all(titlesPromises);
    return subjects.map((subjectid, index) => ({
      subjectid,
      title: titles[index],
    }));
  } catch (err) {
    console.error('Error fetching subjects:', err);
    throw err;
  }
};

const getFullResponse = async (subjectid) => {
  try {
    const cacheKey = `subject:${subjectid}:response`;
    const response = await client.get(cacheKey);
    return response;
  } catch (err) {
    console.error('Error fetching response:', err);
    throw err;
  }
};

const getSummary = async (subjectid) => {
  try {
    const summaryKey = `subject:${subjectid}:summary`;
    const summary = await client.get(summaryKey);
    return summary;
  } catch (err) {
    console.error('Error fetching summary:', err);
    throw err;
  }
};

const getModel = async (subjectid) => {
  try {
    const modelKey = `subject:${subjectid}:model`;
    const model = await client.get(modelKey);
    return model;
  } catch (err) {
    console.error('Error fetching model:', err);
    throw err;
  }
};

const getSubjectText = async (subjectid) => {
  try {
    const subjectKey = `subject:${subjectid}:text`;
    const subjectText = await client.get(subjectKey);
    return subjectText;
  } catch (err) {
    console.error('Error fetching subject text:', err);
    throw err;
  }
};

// Reports Logic
const getReportById = async (id) => {
  const titleKey = `reports:${id}:reporttitle`;
  const reportTextKey = `reports:${id}:reporttext`;
  const title = await client.get(titleKey);
  const reportText = await client.get(reportTextKey);
  return { id, title, reporttext: reportText };
};

app.get('/list-reports', ensureAuthenticated, async (req, res) => {
  try {
    const keys = await client.keys('reports:*:reporttitle');
    const reports = [];

    for (const key of keys) {
      const reportsid = key.split(':')[1];
      const reporttitle = await client.get(key);
      const reporttext = await client.get(`reports:${reportsid}:reporttext`);
      reports.push({ reportsid, reporttitle, reporttext });
    }

    res.json({ success: true, reports });
  } catch (err) {
    console.error('Error listing reports:', err);
    res.json({ success: false, error: 'Error listing reports.' });
  }
});

app.get('/reports/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const report = await getReportById(id);
    res.json(report);
  } catch (err) {
    console.error('Error fetching report:', err);
    res.status(500).send('Error fetching report.');
  }
});

app.post('/reports', ensureAuthenticated, async (req, res) => {
  const { title, reporttext } = req.body;
  try {
    const newId = await client.incr('reports_id_counter');
    await client.set(`reports:${newId}:reporttitle`, title);
    await client.set(`reports:${newId}:reporttext`, reporttext);
    res.sendStatus(201);
  } catch (err) {
    console.error('Error creating new report:', err);
    res.status(500).send('Error creating new report.');
  }
});

app.put('/reports/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { title, reporttext } = req.body;
  try {
    await client.set(`reports:${id}:reporttitle`, title);
    await client.set(`reports:${id}:reporttext`, reporttext);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error updating report:', err);
    res.status(500).send('Error updating report.');
  }
});

app.delete('/reports/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    await client.del(`reports:${id}:reporttitle`);
    await client.del(`reports:${id}:reporttext`);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).send('Error deleting report.');
  }
});

// This route is now handled in routes/main.js

// API endpoint for checking current LLM provider and model
app.get('/api/provider-status', ensureAuthenticated, async (req, res) => {
  try {
    const currentProvider = await getRedisValue(LLM_PROVIDER_REDIS_KEY, 'openai');
    const isOllama = currentProvider === 'ollama';
    const currentModel = isOllama ?
      await getRedisValue(OLLAMA_MODEL_REDIS_KEY, 'llama3.3') :
      await getRedisValue(OPENAI_MODEL_REDIS_KEY, 'gpt-3.5-turbo');
    
    res.json({
      success: true,
      currentProvider,
      currentModel
    });
  } catch (error) {
    console.error('Error retrieving provider status:', error);
    res.json({
      success: false,
      error: 'Failed to retrieve provider status',
      details: error.message
    });
  }
});

// SSE endpoint for real-time LLM status updates
app.get('/llm-status', ensureAuthenticated, (req, res) => {
  console.log('SSE connection established');
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // CORS headers for potential iframe issues
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  // Generate a unique request ID if not already in session
  if (!req.session.llmRequestId) {
    req.session.llmRequestId = uuidv4();
  }
  const requestId = req.session.llmRequestId;
  
  // Initial connection established
  res.write('event: open\ndata: {"status":"connected", "requestId":"' + requestId + '"}\n\n');
  console.log('Sent initial open event with requestId:', requestId);
  
  // Send a test event for debugging
  res.write(`event: processing\ndata: {"status":"Connection active", "timestamp":${Date.now()}, "requestId":"${requestId}"}\n\n`);
  console.log('Sent test processing event');
  
  // Set auto-completion timeout for dev purposes
  // This ensures the modal will eventually complete even if no real events are received
  const autoCompleteTimeout = setTimeout(() => {
    console.log('Auto-complete timeout reached, sending completion event');
    res.write(`event: response\ndata: {"response":"Automatically completed after timeout.", "tokens":"0", "processingTime":"10", "requestId":"${requestId}"}\n\n`);
    clearInterval(pingInterval);
    clearInterval(checkForUpdates);
  }, 30000); // 30 seconds max wait time
  
  // Set up interval to send keepalive pings
  const pingInterval = setInterval(() => {
    res.write(':\n\n'); // Comment as ping
    console.log('Sent SSE ping');
  }, 5000); // Send ping every 5 seconds
  
  // Check for updates on this request ID
  const checkForUpdates = setInterval(() => {
    console.log(`Checking for updates on request ID: ${requestId}`);
    const requestData = activeLLMRequests.get(requestId);
    if (requestData) {
      console.log(`Found data for request ID ${requestId}, events: ${requestData.events.length}`);
      // Send any queued events
      while (requestData.events.length > 0) {
        const event = requestData.events.shift();
        console.log(`Sending event: ${event.type}`);
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
        
        // If this was a response event, we should clean up
        if (event.type === 'response') {
          console.log('Response event sent, clearing intervals');
          clearInterval(pingInterval);
          clearInterval(checkForUpdates);
          clearTimeout(autoCompleteTimeout);
        }
      }
      
      // If request is complete, remove from tracking
      if (requestData.complete) {
        console.log('Request marked as complete, cleaning up');
        clearInterval(checkForUpdates);
        clearInterval(pingInterval);
        clearTimeout(autoCompleteTimeout);
        
        if (requestData.error) {
          console.log('Sending error event:', requestData.error);
          res.write(`event: error\ndata: ${JSON.stringify({message: requestData.error})}\n\n`);
        } else {
          // Send a final completion notice if not already sent
          console.log('Sending final completion notice');
          res.write(`event: complete\ndata: {"status":"Completed", "timestamp":${Date.now()}}\n\n`);
        }
        
        // Delete request data after sending final updates
        setTimeout(() => {
          activeLLMRequests.delete(requestId);
          console.log(`Removed request data for ID ${requestId}`);
        }, 1000);
      }
    }
  }, 1000); // Check for updates every second
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`Client disconnected for request ID: ${requestId}`);
    clearInterval(pingInterval);
    clearInterval(checkForUpdates);
    clearTimeout(autoCompleteTimeout);
    
    // Clean up any lingering request data
    if (activeLLMRequests.has(requestId)) {
      console.log(`Cleaning up request data for ID ${requestId} after disconnect`);
      activeLLMRequests.delete(requestId);
    }
  });
});

// Import utilities for both OpenAI and Ollama
const openaiUtil = require('./utils/openai');
const ollamaUtil = require('./utils/ollama');

// Redis keys for LLM settings
const LLM_PROVIDER_REDIS_KEY = 'settings:llm:provider';
const OPENAI_MODEL_REDIS_KEY = 'settings:openai:model';
const OLLAMA_MODEL_REDIS_KEY = 'settings:ollama:model';

// Using getRedisValue and storeRedisValue imported from redis.js

// Updated /ask route to handle summaries as prompts and track LLM activity
app.post('/ask', ensureAuthenticated, async (req, res) => {
  console.log('==== /ask ENDPOINT CALLED ====');
  console.log('Request body:', req.body);
  console.log('Subject:', req.body.subject);
  // Generate a new request ID and store in session
  const requestId = uuidv4();
  req.session.llmRequestId = requestId;
  
  // Initialize request tracking
  activeLLMRequests.set(requestId, {
    startTime: Date.now(),
    events: [],
    complete: false,
    error: null
  });
  
  // Helper function to add events to the request
  const addEvent = (type, data) => {
    const requestData = activeLLMRequests.get(requestId);
    if (requestData) {
      requestData.events.push({ type, data });
    }
  };
  
  const subjectText = req.body.subject;
  // Get the LLM provider from form or from Redis first
  const providedLlmProvider = req.body.llmProvider;
  const llmProvider = providedLlmProvider || await getRedisValue(LLM_PROVIDER_REDIS_KEY, 'openai');
  
  // Use the model from the form, which will reflect the settings selection
  const model = req.body.model || await getDefaultModelForProvider();
  const selectedPromptId = req.body.selectedPromptId;
  const useEnhancedPrompt = req.body.useEnhancedPrompt === 'true';
  
  // Set isOllama flag - this determines which API we'll use
  const isOllama = llmProvider === 'ollama';
  
  console.log('LLM provider decision:', { providedLlmProvider, llmProvider, model, isOllama });
  
  // Helper function to get default model based on the provider
  async function getDefaultModelForProvider() {
    const provider = await getRedisValue(LLM_PROVIDER_REDIS_KEY, 'openai');
    if (provider === 'ollama') {
      return await getRedisValue(OLLAMA_MODEL_REDIS_KEY, 'llama3.3');
    } else {
      return await getRedisValue(OPENAI_MODEL_REDIS_KEY, 'gpt-3.5-turbo');
    }
  }
  
  // Get API key for OpenAI (not needed for Ollama)
  let apiKey = null;
  if (!isOllama) {
    apiKey = req.body.apiKey || (req.user && req.user.apiKey);
    // Fallback to environment variable if no key is found
    if (!apiKey) {
      apiKey = process.env.API_KEY;
      console.log('Using API key from environment:', apiKey ? 'Key found' : 'No key found');
    }
  }

  try {
    let prompt;
    
    // Send initial status update
    addEvent('processing', { requestId, model, status: 'Fetching prompt template' });

    if (selectedPromptId) {
      // Try fetching from prompts
      prompt = await client.get(`prompt:${selectedPromptId}:prompttext`);
      
      // If not found with prompttext key, try the text key
      if (!prompt) {
        prompt = await client.get(`prompt:${selectedPromptId}:text`);
      }

      // If not found in prompts, try fetching from summaries
      if (!prompt) {
        prompt = await client.get(`summaries:${selectedPromptId}:summaryText`);
        if (!prompt) {
          throw new Error('Selected prompt not found.');
        }
      }
    } else {
      // Fallback to default template
      const templatePath = path.join(__dirname, 'prompt-template.txt');
      prompt = fs.readFileSync(templatePath, 'utf8');
    }
    
    // If enhanced prompt is requested, generate it with context from similar models
    if (useEnhancedPrompt) {
      try {
        // Generate a unique temporary ID for the subject
        const tempSubjectId = `temp_${Date.now()}`;
        
        // Update status
        addEvent('processing', { status: 'Enhancing prompt with similar models' });
        
        // Find similar subjects based on the text
        const similarSubjects = await app.locals.threatAnalyzer.findSimilarSubjects(tempSubjectId, subjectText);
        
        // Generate enhanced prompt with context from similar models
        if (similarSubjects.length > 0) {
          const enhancedPrompt = await app.locals.threatAnalyzer.generateEnhancedPrompt(subjectText, similarSubjects);
          if (enhancedPrompt) {
            prompt = enhancedPrompt;
          }
        }
      } catch (err) {
        console.error('Error generating enhanced prompt:', err);
        // Fall back to regular prompt if there's an error
      }
    }

    // Send the formatted prompt to the client for display
    addEvent('prompt', { prompt: prompt.replace('SUBJECT', subjectText), status: 'Prompt prepared' });
    
    const subjectid = await client.incr('subject_id_counter');
    const cacheKey = `subject:${subjectid}:response`;
    const titleKey = `subject:${subjectid}:title`;
    const modelKey = `subject:${subjectid}:model`;
    const subjectKey = `subject:${subjectid}:text`;
    const promptIdKey = `subject:${subjectid}:promptid`;
    const providerKey = `subject:${subjectid}:provider`;

    let cachedResponse = await client.get(cacheKey);
    if (cachedResponse) {
      res.redirect(`/results?subjectid=${encodeURIComponent(subjectid)}`);
    } else {
      // Create the final prompt by replacing SUBJECT placeholder
      const finalPrompt = prompt.replace('SUBJECT', subjectText);
      console.log('Final prompt first 100 chars:', finalPrompt.substring(0, 100) + '...');
      
      // Track time for processing
      const requestStartTime = Date.now();
      let apiResponse;
      let tokens = 'Not available';
      
      // Use the appropriate LLM service based on provider
      if (isOllama) {
        console.log('Sending request to Ollama API...');
        console.log('Using model:', model);
        
        // Update status
        addEvent('processing', { status: 'Sending request to Ollama', model, requestId });
        
        try {
          // Check if Ollama is available
          const ollamaStatus = await ollamaUtil.checkStatus();
          if (!ollamaStatus) {
            throw new Error('Ollama service is not available. Please check if Ollama is running.');
          }
          
          // Send request to Ollama
          const ollamaResponse = await ollamaUtil.getCompletion(finalPrompt, model);
          
          // Extract response properly from the Ollama response structure
          console.log('Ollama response structure:', JSON.stringify(ollamaResponse).substring(0, 200) + '...');
          
          // If the response has choices with text (Ollama /generate endpoint format)
          if (ollamaResponse.choices && ollamaResponse.choices.length > 0 && ollamaResponse.choices[0].text) {
            apiResponse = ollamaResponse.choices[0].text;
          }
          // If the response has choices with message.content (formatted like OpenAI)
          else if (ollamaResponse.choices && ollamaResponse.choices.length > 0 && ollamaResponse.choices[0].message?.content) {
            apiResponse = ollamaResponse.choices[0].message.content;
          } 
          // If it has a direct response property
          else if (ollamaResponse.response) {
            apiResponse = ollamaResponse.response;
          } 
          // Fallback if response is directly the content
          else {
            apiResponse = String(ollamaResponse);
          }
          
          console.log('Extracted API response length:', apiResponse ? apiResponse.length : 0);
          
          if (ollamaResponse.usage) {
            tokens = `${ollamaResponse.usage.prompt_tokens || 0} prompt + ${ollamaResponse.usage.completion_tokens || 0} completion = ${ollamaResponse.usage.total_tokens || 0} total`;
          } else if (ollamaResponse.stats) {
            tokens = `${ollamaResponse.stats.prompt_tokens || 0} prompt + ${ollamaResponse.stats.completion_tokens || 0} completion = ${ollamaResponse.stats.total_tokens || 0} total`;
          }
        } catch (error) {
          throw new Error(`Ollama error: ${error.message}`);
        }
      } else {
        // Using OpenAI
        console.log('Sending request to OpenAI API...');
        console.log('Using model:', model);
        console.log('API Key (truncated):', apiKey ? `${apiKey.substring(0, 5)}...` : 'Missing');
        
        // Update status
        addEvent('processing', { status: 'Sending request to OpenAI', model, requestId });
        
        // When using OpenAI, make sure we're using an OpenAI model
        // If the requested model is an Ollama model but we're using OpenAI provider, fallback to a default OpenAI model
        let openAIModel = model;
        
        // Check if the model looks like an Ollama model (contains 'llama', 'mistral', etc.)
        if (model && (model.includes('llama') || model.includes('mistral') || model.includes('deepseek'))) {
          console.log('⚠️ Attempted to use Ollama model with OpenAI provider. Falling back to default OpenAI model.');
          openAIModel = await getRedisValue(OPENAI_MODEL_REDIS_KEY, 'gpt-3.5-turbo');
        }
        
        const openAIRequest = {
          model: openAIModel || 'gpt-3.5-turbo', // Fallback to gpt-3.5-turbo if model is not specified
          messages: [
            {
              role: 'user',
              content: finalPrompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        };
        
        console.log('Request data:', JSON.stringify(openAIRequest, null, 2));
        
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          openAIRequest,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
          }
        );
        
        apiResponse = response.data.choices[0].message.content;
        
        if (response.data.usage) {
          tokens = `${response.data.usage.prompt_tokens} prompt + ${response.data.usage.completion_tokens} completion = ${response.data.usage.total_tokens} total`;
        }
      }
      
      // Calculate processing time
      const processingTime = ((Date.now() - requestStartTime) / 1000).toFixed(2);
      
      // Send response to client
      addEvent('response', { 
        response: apiResponse,
        tokens,
        processingTime,
        requestId
      });
      
      // Save results to Redis
      await client.set(cacheKey, String(apiResponse || ''), { EX: 3600 });
      await client.set(titleKey, String(subjectText || ''));
      await client.set(modelKey, String(model || ''));
      await client.set(subjectKey, String(subjectText || ''));
      await client.set(providerKey, String(isOllama ? 'ollama' : 'openai'));
      
      // Only set promptId if it's defined and not null
      if (selectedPromptId) {
        await client.set(promptIdKey, String(selectedPromptId));
      } else {
        await client.set(promptIdKey, 'default');
      }
      
      // Store debug information
      await client.set(`debug:${subjectid}:interaction`, JSON.stringify({
        requestId,
        model,
        provider: isOllama ? 'ollama' : 'openai',
        tokens,
        processingTime,
        prompt,
        timestamp: new Date().toISOString()
      }));
      
      // Mark request as complete
      const activeRequest = activeLLMRequests.get(requestId);
      if (activeRequest) {
        activeRequest.complete = true;
      }
      
      res.redirect(`/results?subjectid=${encodeURIComponent(subjectid)}`);
    }
  } catch (error) {
    console.error('=============== ERROR COMMUNICATING WITH OPENAI API ===============');
    console.error('Error message:', error.message);
    
    // Determine a user-friendly error message based on the error type
    let userErrorMessage = 'Error communicating with OpenAI API. Check server logs for details.';
    let errorType = 'unknown';
    let errorCode = 'unknown';
    
    // Log more detailed information about the error
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      // Extract error details from the response
      errorType = error.response?.data?.error?.type || 'unknown';
      errorCode = error.response?.data?.error?.code || 'unknown';
      
      // Custom error messages based on the response
      if (error.response.status === 429) {
        if (errorCode === 'insufficient_quota') {
          userErrorMessage = 'You have exceeded your OpenAI API quota. Please check your billing details or use a different API key.';
        } else {
          userErrorMessage = 'OpenAI API rate limit exceeded. Please try again later.';
        }
      } else if (error.response.status === 401) {
        userErrorMessage = 'Invalid API key provided. Please check your API key and try again.';
      } else if (error.response.status === 400) {
        userErrorMessage = 'Bad request sent to OpenAI. Please check your prompt and try again.';
      }
      
    } else if (error.request) {
      console.error('Request was made but no response received');
      console.error('Request details:', error.request);
      userErrorMessage = 'No response received from OpenAI API. Check your internet connection.';
      
    } else {
      console.error('Error occurred before request was sent');
      console.error('Full error object:', error);
      userErrorMessage = 'Error occurred before sending request to OpenAI API.';
    }
    
    // Also log the API key details (safely)
    console.error('API Key used (first 4 chars):', apiKey ? apiKey.substring(0, 4) + '...' : 'No API key');
    console.error('API Key length:', apiKey ? apiKey.length : 0);
    console.error('===============================================================');
    
    // Update request status with detailed error
    const requestData = activeLLMRequests.get(requestId);
    if (requestData) {
      requestData.error = {
        message: error.message,
        userMessage: userErrorMessage,
        type: errorType,
        code: errorCode,
        status: error.response?.status || 500
      };
      requestData.complete = true;
      addEvent('error', { 
        message: error.message,
        userMessage: userErrorMessage,
        type: errorType,
        code: errorCode,
        status: error.response?.status || 500
      });
    }
    
    // Store error information for debugging if we have a request ID
    if (requestId) {
      const errorKey = `debug:${requestId}:error`;
      client.set(errorKey, JSON.stringify({
        message: error.message,
        userMessage: userErrorMessage,
        status: error.response?.status || 500,
        errorType,
        errorCode,
        timestamp: new Date().toISOString()
      }));
    }
    
    res.redirect(`/error?message=${encodeURIComponent(userErrorMessage)}`);
    // Alternatively, return a JSON response if preferred:
    // res.status(error.response?.status || 500).json({
    //   error: userErrorMessage,
    //   details: errorType !== 'unknown' ? { type: errorType, code: errorCode } : undefined
    // });
  }
});

app.get('/search-titles', ensureAuthenticated, async (req, res) => {
  const query = req.query.query.toLowerCase();

  try {
    const subjectsWithTitles = await getAllSubjectsWithTitles();
    const results = subjectsWithTitles.filter((subjectObj) =>
      subjectObj.title.toLowerCase().includes(query)
    );

    res.json({ results });
  } catch (err) {
    console.error('Error searching titles:', err);
    res.status(500).send('Error searching titles');
  }
});

// Debug save endpoint to test direct Redis operations
app.post('/debug-save/:subjectid', ensureAuthenticated, async (req, res) => {
  try {
    const { subjectid } = req.params;
    const { editedResponse, title, subjectText, timestamp } = req.body;
    
    console.log('=== DEBUG SAVE OPERATION ===');
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Subject ID: ${subjectid}`);
    console.log(`Content-Type: ${req.headers['content-type']}`);
    console.log(`Response length: ${editedResponse ? editedResponse.length : 0}`);
    console.log(`Title length: ${title ? title.length : 0}`);
    console.log(`Subject text length: ${subjectText ? subjectText.length : 0}`);
    console.log('===========================');
    
    // Define Redis keys
    const cacheKey = `subject:${subjectid}:response`;
    const titleKey = `subject:${subjectid}:title`;
    const subjectKey = `subject:${subjectid}:text`;
    
    // First, get the original value for comparison
    const originalResponse = await client.get(cacheKey);
    const originalTitle = await client.get(titleKey);
    const originalSubjectText = await client.get(subjectKey);
    
    // Save the data to Redis one by one
    console.log('Saving response to Redis...');
    await client.set(cacheKey, editedResponse);
    
    console.log('Saving title to Redis...');
    await client.set(titleKey, title || '');
    
    console.log('Saving subject text to Redis...');
    await client.set(subjectKey, subjectText || '');
    
    // Retrieve the saved values for verification
    const savedResponse = await client.get(cacheKey);
    const savedTitle = await client.get(titleKey);
    const savedSubjectText = await client.get(subjectKey);
    
    // Compare and return detailed results
    const results = {
      success: true,
      timestamp: Date.now(),
      response: {
        original: originalResponse ? originalResponse.length : 0,
        saved: savedResponse ? savedResponse.length : 0,
        match: savedResponse === editedResponse
      },
      title: {
        original: originalTitle ? originalTitle.length : 0,
        saved: savedTitle ? savedTitle.length : 0,
        match: savedTitle === title
      },
      subjectText: {
        original: originalSubjectText ? originalSubjectText.length : 0,
        saved: savedSubjectText ? savedSubjectText.length : 0,
        match: savedSubjectText === subjectText
      }
    };
    
    console.log('Debug save results:', results);
    res.json(results);
  } catch (error) {
    console.error('DEBUG SAVE ERROR:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Routes for Redis testing
app.get('/redis-test', ensureAuthenticated, (req, res) => {
  res.render('redis-test');
});

app.post('/redis-test/save', ensureAuthenticated, async (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key || !value) {
      return res.status(400).json({
        success: false,
        error: 'Missing key or value'
      });
    }
    
    // Log the values being saved
    console.log('Redis test - Saving key:', key);
    console.log('Redis test - Value length:', value.length);
    
    // Save to Redis
    await client.set(key, value);
    
    // Verify it was saved correctly
    const savedValue = await client.get(key);
    
    res.json({
      success: true,
      key,
      valueLength: value.length,
      savedValueLength: savedValue ? savedValue.length : 0,
      valueMatches: savedValue === value
    });
  } catch (error) {
    console.error('Redis test save error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/redis-test/get', ensureAuthenticated, async (req, res) => {
  try {
    const { key } = req.query;
    
    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Missing key'
      });
    }
    
    // Get from Redis
    const value = await client.get(key);
    
    if (value === null) {
      return res.json({
        success: false,
        error: 'Key not found'
      });
    }
    
    res.json({
      success: true,
      key,
      value,
      valueLength: value.length
    });
  } catch (error) {
    console.error('Redis test get error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/redis-test/keys', ensureAuthenticated, async (req, res) => {
  try {
    const { pattern } = req.query;
    
    if (!pattern) {
      return res.status(400).json({
        success: false,
        error: 'Missing pattern'
      });
    }
    
    // Get keys from Redis
    const keys = await client.keys(pattern);
    
    // For each key, get its type
    const keyInfo = await Promise.all(keys.map(async (key) => {
      const type = await client.type(key);
      let size = '?';
      
      if (type === 'string') {
        const value = await client.get(key);
        size = value ? value.length : 0;
      }
      
      return { key, type, size };
    }));
    
    res.json({
      success: true,
      pattern,
      keyCount: keys.length,
      keys: keyInfo
    });
  } catch (error) {
    console.error('Redis test keys error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint to directly check Redis values
app.get('/redis-debug', ensureAuthenticated, async (req, res) => {
  const { subjectid } = req.query;
  if (!subjectid) {
    return res.status(400).json({ error: 'Missing subject ID' });
  }
  
  try {
    // Fetch all data for this subject ID
    const response = await client.get(`subject:${subjectid}:response`);
    const title = await client.get(`subject:${subjectid}:title`);
    const subjectText = await client.get(`subject:${subjectid}:text`);
    const model = await client.get(`subject:${subjectid}:model`);
    const summary = await client.get(`subject:${subjectid}:summary`);
    
    // Get a list of all keys for this subject ID to check for any unexpected keys
    const allKeys = await client.keys(`subject:${subjectid}:*`);
    
    res.json({
      subjectid,
      responseLength: response ? response.length : 0,
      responsePreview: response ? response.substring(0, 200) + '...' : null,
      titleLength: title ? title.length : 0,
      title: title,
      subjectTextLength: subjectText ? subjectText.length : 0,
      subjectText: subjectText,
      model: model,
      summaryLength: summary ? summary.length : 0,
      allKeys: allKeys,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error fetching data from Redis:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/results', ensureAuthenticated, async (req, res) => {
  const { subjectid } = req.query;
  let response, title, summary, model, subjectText;

  try {
    // Add more detailed logging
    console.log(`Loading results page for subject ID: ${subjectid}`);
    
    response = await getFullResponse(subjectid);
    console.log(`Response loaded, length: ${response ? response.length : 0}`);
    
    title = await client.get(`subject:${subjectid}:title`);
    console.log(`Title loaded: ${title}`);
    
    summary = await getSummary(subjectid);
    model = await getModel(subjectid);
    subjectText = await getSubjectText(subjectid);
    console.log(`Subject text loaded, length: ${subjectText ? subjectText.length : 0}`);
  } catch (error) {
    console.error('Error fetching response from Redis:', error);
    res.send('Error fetching response from Redis.');
    return;
  }

  res.render('results', {
    subjectid,
    subjectText,
    response,
    title,
    summary,
    model,
    user: req.user,
  });
});

app.get('/get-summary', ensureAuthenticated, async (req, res) => {
  const { subjectid } = req.query;

  try {
    const summary = await getSummary(subjectid);
    if (summary) {
      res.json({ success: true, summary });
    } else {
      res.json({ success: false, error: 'No summary found' });
    }
  } catch (error) {
    console.error('Error fetching summary from Redis:', error);
    res.json({ success: false, error: 'Error fetching summary from Redis' });
  }
});

// Dedicated endpoint for saving threat model changes
app.post('/save-changes', ensureAuthenticated, async (req, res) => {
  try {
    const { subjectid, editedResponse, title, subjectText } = req.body;
    
    console.log('=== DEBUG SAVE ENDPOINT CALLED ===');
    console.log(`Subject ID: ${subjectid}`);
    console.log(`Title length: ${title?.length || 0}`);
    console.log(`Subject text length: ${subjectText?.length || 0}`);
    console.log(`Response length: ${editedResponse?.length || 0}`);

    // Define Redis keys (simple consistent naming)
    const cacheKey = `subject:${subjectid}:response`;
    const titleKey = `subject:${subjectid}:title`;
    const subjectKey = `subject:${subjectid}:text`;
    
    if (!subjectid) {
      return res.status(400).json({ success: false, error: 'Missing subject ID' });
    }
    
    if (!editedResponse) {
      return res.status(400).json({ success: false, error: 'Missing edited response content' });
    }
    
    // Simple direct save to Redis
    await client.set(cacheKey, editedResponse);
    await client.set(titleKey, title || '');
    await client.set(subjectKey, subjectText || '');
    
    // Verify that we can retrieve what we just saved
    const savedResponse = await client.get(cacheKey);
    const savedTitle = await client.get(titleKey);
    const savedSubject = await client.get(subjectKey);
    
    // Return detailed information for debugging
    return res.json({
      success: true,
      message: 'Changes saved successfully',
      savedLength: savedResponse ? savedResponse.length : 0,
      originalLength: editedResponse ? editedResponse.length : 0,
      titleSaved: savedTitle === title,
      subjectSaved: savedSubject === subjectText
    });
  } catch (error) {
    console.error('DEBUG SAVE ERROR:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
});

// Original edit endpoint
app.post('/edit', ensureAuthenticated, async (req, res) => {
  // Extract the form data - now handles both JSON and form data formats
  const { subjectid, subjectText, editedResponse, title, timestamp } = req.body;
  
  // Additional logging for troubleshooting
  console.log('Request Content-Type:', req.headers['content-type']);
  console.log('Request body keys:', Object.keys(req.body));
  
  // Extensive logging to debug any issues
  console.log('=== EDIT REQUEST DEBUG INFO ===');
  console.log(`Request received at: ${new Date().toISOString()}`);
  console.log(`Subject ID: ${subjectid}`);
  console.log(`Timestamp: ${timestamp || 'not provided'}`);
  console.log(`Title length: ${title ? title.length : 0}`);
  console.log(`Subject text length: ${subjectText ? subjectText.length : 0}`);
  console.log(`Edited response length: ${editedResponse ? editedResponse.length : 0}`);
  console.log(`Content-Type: ${req.headers['content-type'] || 'not specified'}`);
  console.log('===============================');
  
  // Define Redis keys
  const cacheKey = `subject:${subjectid}:response`;
  const titleKey = `subject:${subjectid}:title`;
  const subjectKey = `subject:${subjectid}:text`;
  
  // Basic validation
  if (!subjectid) {
    console.error('ERROR: Missing subject ID');
    return res.status(400).send('Missing subject ID');
  }
  
  if (!editedResponse) {
    console.error('ERROR: Missing edited response content');
    return res.status(400).send('Missing edited response content');
  }

  try {
    // Simplest approach - direct Redis commands one at a time
    console.log('Saving response to Redis...');
    await client.set(cacheKey, editedResponse);
    console.log('Response saved successfully');
    
    console.log('Saving title to Redis...');
    await client.set(titleKey, title || '');
    console.log('Title saved successfully');
    
    console.log('Saving subject text to Redis...');
    await client.set(subjectKey, subjectText || '');
    console.log('Subject text saved successfully');
    
    // Double-check the saved data
    console.log('Verifying saved data...');
    const savedResponse = await client.get(cacheKey);
    
    if (!savedResponse) {
      console.error('VERIFICATION ERROR: No response found after saving');
      return res.status(500).send('Error saving changes - verification failed');
    }
    
    const originalLength = editedResponse ? editedResponse.length : 0;
    const savedLength = savedResponse ? savedResponse.length : 0;
    
    console.log(`Verification - Original length: ${originalLength}, Saved length: ${savedLength}`);
    
    if (originalLength !== savedLength) {
      console.warn(`WARNING: Length mismatch - original: ${originalLength}, saved: ${savedLength}`);
    } else {
      console.log('Verification successful - lengths match');
    }
    
    console.log(`Successfully saved all changes for subject: ${subjectid}`);
    
    // Check if this is an AJAX request or traditional form submission
    const isJsonRequest = req.headers['content-type'] && req.headers['content-type'].includes('application/json');
    
    if (isJsonRequest) {
      // For AJAX requests, return JSON response
      return res.json({ success: true, message: 'Changes saved successfully' });
    } else {
      // For traditional form submissions, redirect
      return res.redirect(`/results?subjectid=${encodeURIComponent(subjectid)}&t=${Date.now()}`);
    }
  } catch (error) {
    console.error('ERROR SAVING DATA TO REDIS:', error);
    
    // Check if this is an AJAX request or traditional form submission
    const isJsonRequest = req.headers['content-type'] && req.headers['content-type'].includes('application/json');
    
    if (isJsonRequest) {
      // For AJAX requests, return JSON error response
      return res.status(500).json({ 
        success: false, 
        error: `Error updating response: ${error.message}` 
      });
    } else {
      // For traditional form submissions, return error text
      return res.status(500).send(`Error updating response: ${error.message}`);
    }
  }
});

app.post('/delete-subjects', ensureAuthenticated, async (req, res) => {
  const subjectsToDelete = req.body.subjectsToDelete;

  if (!subjectsToDelete) {
    res.redirect('/');
    return;
  }

  try {
    const deletePromises = Array.isArray(subjectsToDelete)
      ? subjectsToDelete.map((subjectid) => {
          return Promise.all([
            client.del(`subject:${subjectid}:response`),
            client.del(`subject:${subjectid}:title`),
            client.del(`subject:${subjectid}:summary`),
            client.del(`subject:${subjectid}:model`),
            client.del(`subject:${subjectid}:text`),
          ]);
        })
      : [
          client.del(`subject:${subjectsToDelete}:response`),
          client.del(`subject:${subjectsToDelete}:title`),
          client.del(`subject:${subjectsToDelete}:summary`),
          client.del(`subject:${subjectsToDelete}:model`),
          client.del(`subject:${subjectsToDelete}:text`),
        ];

    await Promise.all(deletePromises);
    res.redirect('/');
  } catch (error) {
    console.error('Error deleting subjects:', error);
    res.send('Error deleting subjects.');
  }
});

app.post('/generate-more', ensureAuthenticated, async (req, res) => {
  const { subjectid } = req.body;
  const userEmail = req.user.email;
  const debugData = {};

  try {
    console.log(`----- GENERATE MORE DEBUG -----`);
    console.log(`Generate-more request for subject ${subjectid} by user ${userEmail}`);
    
    // Get the original prompt used to generate the initial response
    const promptId = await client.get(`subject:${subjectid}:promptid`);
    console.log(`Found prompt ID: ${promptId || 'NONE'}`);  
    
    let originalPrompt = "";
    if (promptId) {
      originalPrompt = await client.get(`prompts:${promptId}:prompttext`);
      console.log(`Original prompt found: ${originalPrompt ? 'YES (length: ' + originalPrompt.length + ')' : 'NO'}`); 
      debugData.originalPromptId = promptId;
      debugData.originalPrompt = originalPrompt;
    }

    // Get the LLM provider and model first
    console.log('Retrieving LLM provider from Redis key:', LLM_PROVIDER_REDIS_KEY);
    let llmProvider;
    try {
      const rawValue = await client.get(LLM_PROVIDER_REDIS_KEY);
      console.log(`Raw Redis value for ${LLM_PROVIDER_REDIS_KEY}:`, rawValue);
      
      llmProvider = rawValue || 'openai'; // Default to 'openai' if null/undefined
      console.log(`Current LLM provider from Redis: ${llmProvider}`);
      
      // If provider value is empty, set a default, but respect the value if it's valid
      if (!rawValue) {
        // Only set default if completely missing
        console.log(`Missing LLM provider value, setting default: openai`);
        await client.set(LLM_PROVIDER_REDIS_KEY, 'openai');
        llmProvider = 'openai';
      } else if (rawValue === 'ollama' || rawValue === 'openai') {
        // Use the valid provider that was saved in settings
        console.log(`Using saved provider from settings: ${rawValue}`);
        llmProvider = rawValue;
      } else {
        // Invalid value
        console.log(`Invalid LLM provider value: ${rawValue}, setting default: openai`);
        await client.set(LLM_PROVIDER_REDIS_KEY, 'openai');
        llmProvider = 'openai';
      }
    } catch (error) {
      console.error('Error getting LLM provider from Redis:', error);
      llmProvider = 'openai'; // Default to 'openai' on error
      debugData.error = `Redis error: ${error.message}`;
    }

    // Set isOllama flag - this determines which API we'll use
    const isOllama = llmProvider === 'ollama';
    debugData.llmProvider = llmProvider;
    debugData.isOllama = isOllama;
    
    // Get appropriate model based on provider
    let model;
    if (isOllama) {
      model = await client.get(OLLAMA_MODEL_REDIS_KEY) || 'llama3.3';
    } else {
      model = await client.get(OPENAI_MODEL_REDIS_KEY) || 'gpt-3.5-turbo';
    }
    console.log(`Using model: ${model} for provider: ${llmProvider}`);
    
    // Only check for API key if using OpenAI
    let apiKey = null;
    if (!isOllama) {
      // Get API key - First try user's key, then fallback to environment
      apiKey = await client.hGet(`user:${userEmail}`, 'apiKey');
      if (!apiKey) {
        apiKey = process.env.API_KEY;
        console.log('Using API key from environment variable');
        debugData.apiKeySource = 'environment';
        
        if (!apiKey) {
          debugData.error = 'No API key available for OpenAI';
          await client.set(`debug:${subjectid}:generate-more`, JSON.stringify(debugData));
          return res.json({
            success: false,
            error: 'OpenAI API Key not found. Please add an API key in your profile or set it in the environment, or switch to Ollama provider in settings.',
            debug: debugData
          });
        }
      } else {
        debugData.apiKeySource = 'user profile';
      }
    }
    console.log(`API key source: ${debugData.apiKeySource}`);

    // Get the subject text
    const subjectText = await getSubjectText(subjectid);
    console.log(`Subject text found: ${subjectText ? 'YES (length: ' + subjectText.length + ')' : 'NO'}`);
    debugData.subjectText = subjectText;

    // Get the existing response and model
    console.log('Fetching existing response and model...');
    const existingResponse = await getFullResponse(subjectid);
    if (!existingResponse) {
      console.log('No existing response found for this subject');
      debugData.error = 'No existing response found';
      await client.set(`debug:${subjectid}:generate-more`, JSON.stringify(debugData));
      return res.json({
        success: false,
        error: 'No existing response found for this subject.',
        debug: debugData
      });
    }
    console.log(`Existing response found: (length: ${existingResponse.length})`);
    debugData.existingResponseLength = existingResponse.length;
    
    // We already have the LLM provider and model from earlier
    console.log(`Using previously determined LLM provider: ${llmProvider}`);
    debugData.llmProvider = llmProvider;
    debugData.llmProviderRedisKey = LLM_PROVIDER_REDIS_KEY;
    console.log(`Is using Ollama: ${isOllama}`);
    debugData.isUsingOllama = isOllama;
    
    // Fallback to model used in original request if available
    const originalModel = await getModel(subjectid);
    if (originalModel) {
      // Only use the original model if it matches the current provider type
      const isOriginalModelOllama = originalModel.includes('llama') || originalModel.includes('mistral');
      if (isOllama === isOriginalModelOllama) {
        model = originalModel;
      }
    }
    
    console.log(`Using model: ${model} with provider: ${llmProvider}`);
    debugData.model = model;
    debugData.isOllama = isOllama;

    // Let's use the original prompt if available
    let prompt;
    if (originalPrompt && subjectText) {
      // Use the updated prompt format that references the original prompt and focuses on distinct threats
      prompt = `Please begin by using the prompt that was initially selected for creating this threat model:\n\n${originalPrompt}\n\nThen, provide an analysis of security threat models for ${subjectText}. In your analysis, ensure that each threat model is distinct, and avoid repeating any threat model or description. If a similar threat model applies in more than one context, clearly differentiate each by highlighting its unique attributes or nuances. Focus on providing a variety of threat models without any redundancy.\n\nExisting threat models:\n\n${existingResponse}`;
      console.log('Using original prompt + subject + existing response');
    } else {
      // Fallback approach when original prompt is not available
      prompt = `Please provide an analysis of security threat models for this subject. In your analysis, ensure that each threat model is distinct, and avoid repeating any threat model or description. If a similar threat model applies in more than one context, clearly differentiate each by highlighting its unique attributes or nuances. Focus on providing a variety of threat models without any redundancy.\n\nExisting threat models:\n\n${existingResponse}`;
      console.log('Using fallback prompt (existing response only)');
    }
    
    console.log(`Prompt length: ${prompt.length}`);
    // Log the full prompt for better debugging
    console.log('================ FULL PROMPT ================');
    console.log(prompt);
    console.log('============= END OF FULL PROMPT =============');
    console.log('Prompt created, sending request to OpenAI API...');
    debugData.promptUsed = prompt;

    // Make API request with exact same structure as working version
    const requestData = {
      model,
      messages: [{ role: 'user', content: prompt }]
    };
    debugData.requestData = requestData;

    console.log('Sending API request with model:', model);
    console.log('Message length:', prompt.length, 'characters');
    
    let response;
    let newResponse;
    
    if (isOllama) {
      // Use Ollama API
      console.log('Sending request to Ollama API...');
      
      try {
        // Check if Ollama is available
        const ollamaStatus = await ollamaUtil.checkStatus();
        if (!ollamaStatus) {
          throw new Error('Ollama service is not available. Please check if Ollama is running.');
        }
        
        // Use the Ollama utility to send the request
        const ollamaResponse = await ollamaUtil.getCompletion(prompt, model);
        console.log('Response received from Ollama API');
        console.log('Ollama response structure:', JSON.stringify(ollamaResponse).substring(0, 200) + '...');
        
        debugData.responseReceived = true;
        debugData.rawResponse = ollamaResponse;
        
        // Extract the response from Ollama's response structure
        if (ollamaResponse.choices && ollamaResponse.choices.length > 0 && ollamaResponse.choices[0].text) {
          newResponse = ollamaResponse.choices[0].text;
        } else if (ollamaResponse.choices && ollamaResponse.choices.length > 0 && ollamaResponse.choices[0].message?.content) {
          newResponse = ollamaResponse.choices[0].message.content;
        } else if (ollamaResponse.response) {
          newResponse = ollamaResponse.response;
        } else {
          throw new Error('Unable to extract response content from Ollama API response');
        }
      } catch (error) {
        console.error('----- GENERATE MORE ERROR -----');
        console.error('Error with Ollama API:', error.message);
        throw error; // Let the catch block handle this
      }
    } else {
      // Use OpenAI API
      console.log('Sending request to OpenAI API...');
      
      response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Response received from OpenAI API');
      debugData.responseReceived = true;
      debugData.rawResponse = response.data;
      
      if (!response.data || !response.data.choices || !response.data.choices[0]) {
        console.error('Unexpected response format:', JSON.stringify(response.data));
        debugData.error = 'Invalid response format';
        await client.set(`debug:${subjectid}:generate-more`, JSON.stringify(debugData));
        return res.json({
          success: false,
          error: 'Invalid response format from OpenAI API',
          debug: debugData
        });
      }

      // Process the OpenAI response
      newResponse = response.data.choices[0].message.content;
    }
    
    // Process the response and update Redis
    console.log(`New response received: (length: ${newResponse.length})`);
    console.log('First 100 chars:', newResponse.substring(0, 100));
    debugData.newResponseLength = newResponse.length;
    debugData.newResponsePreview = newResponse.substring(0, 100);
    
    const updatedResponse = `${existingResponse}\n\n### Additional Threats\n\n${newResponse}`.trim();

    console.log(`Saving updated response (${updatedResponse.length} chars) to Redis...`);
    await client.set(`subject:${subjectid}:response`, updatedResponse);
    debugData.success = true;
    
    // Save debug data to Redis
    await client.set(`debug:${subjectid}:generate-more`, JSON.stringify(debugData));
    console.log('Debug data saved to Redis');
    console.log(`----- END GENERATE MORE DEBUG -----`);
    
    // Instead of redirecting, respond with JSON for debugging
    return res.json({
      success: true,
      message: 'Successfully generated more threats',
      redirect: `/results?subjectid=${encodeURIComponent(subjectid)}`,
      debug: {
        promptLength: prompt.length,
        newResponseLength: newResponse.length,
        newResponsePreview: newResponse.substring(0, 200),
        subjectId: subjectid
      }
    });
  } catch (error) {
    console.error('----- GENERATE MORE ERROR -----');
    console.error('Error generating more results:', error.message);
    debugData.error = error.message;
    
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data));
      console.error('Response status:', error.response.status);
      debugData.responseError = {
        data: error.response.data,
        status: error.response.status
      };
    }
    
    await client.set(`debug:${subjectid}:generate-more`, JSON.stringify(debugData));
    console.error('----- END GENERATE MORE ERROR -----');
    
    return res.json({
      success: false,
      error: `Error generating more results: ${error.message}`,
      debug: debugData
    });
  }
});

// app.js

app.post('/generate-summary', ensureAuthenticated, async (req, res) => {
  const { subjectid } = req.body;
  let selectedSummaryPromptId = req.body.selectedSummaryPromptId;
  const summaryKey = `subject:${subjectid}:summary`;

  try {
    console.log('Generating summary for subjectid:', subjectid);

    // Fetch the existing response from Redis
    const existingResponse = await getFullResponse(subjectid);
    if (!existingResponse) {
      throw new Error('No existing response found for subject');
    }

    let promptSummary;

    if (selectedSummaryPromptId) {
      // Store the selected summary prompt ID for this subject
      await client.set(`subject:${subjectid}:summarypromptid`, selectedSummaryPromptId);
    } else {
      // Try to get the selected summary prompt ID from Redis
      selectedSummaryPromptId = await client.get(`subject:${subjectid}:summarypromptid`);
    }

    if (selectedSummaryPromptId) {
      // Fetch the summary template from Redis using the selected summary prompt ID
      promptSummary = await client.get(`prompts:${selectedSummaryPromptId}:prompttext`);
      if (!promptSummary) {
        // If not found in prompts, try fetching from summaries
        promptSummary = await client.get(`summaries:${selectedSummaryPromptId}:summaryText`);
        if (!promptSummary) {
          throw new Error('Selected summary prompt not found.');
        }
      }
    } else {
      // Fetch the default summary template from Redis
      promptSummary = await client.get('prompt:summary:template');
      if (!promptSummary) {
        throw new Error('No summary template found in Redis');
      }
    }

    const subjectText = await getSubjectText(subjectid);
    const model = await getModel(subjectid);
    // Try to get API key from user profile, then fallback to environment
    let userApiKey = await client.hGet(`user:${req.user.email}`, 'apiKey');
    
    // Fallback to environment variable if no key is found
    if (!userApiKey) {
      userApiKey = process.env.API_KEY;
      console.log('Using API key from environment for summary generation:', userApiKey ? 'Key found' : 'No key found');
      
      if (!userApiKey) {
        throw new Error('No API key available. Please add an API key in your profile or set it in the environment.');
      }
    }

    const prompt = `${promptSummary} ${subjectText} ${existingResponse}`;
    console.log('Prompt for summary:', prompt);

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${userApiKey}`,
        },
        timeout: 60000,
      }
    );

    const summary = response.data.choices[0].message.content;
    console.log('Generated summary:', summary);

    // Store the generated summary in Redis
    await client.set(summaryKey, summary);
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error generating summary:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Summaries API endpoints

// Get all summaries
app.get('/summaries', ensureAuthenticated, async (req, res) => {
  try {
    const keys = await client.keys('summaries:*:title');
    const summaries = await Promise.all(
      keys.map(async (key) => {
        const id = key.split(':')[1];
        const title = await client.get(key);
        return { id, title };
      })
    );
    res.json({ summaries });
  } catch (err) {
    console.error('Error fetching summaries:', err);
    res.status(500).send('Error fetching summaries');
  }
});

// Get a specific summary
app.get('/summaries/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const title = await client.get(`summaries:${id}:title`);
    const summaryText = await client.get(`summaries:${id}:summaryText`);

    if (title !== null && summaryText !== null) {
      res.json({ title, summaryText });
    } else {
      res.status(404).json({ success: false, error: 'Summary not found' });
    }
  } catch (err) {
    console.error('Error fetching summary:', err);
    res.status(500).json({ success: false, error: 'Error fetching summary' });
  }
});

// Add a new summary
app.post('/summaries', ensureAuthenticated, async (req, res) => {
  try {
    const { title, summaryText } = req.body;
    const newId = await client.incr('summaries_id_counter');
    await client.set(`summaries:${newId}:title`, title);
    await client.set(`summaries:${newId}:summaryText`, summaryText);
    res.json({ success: true });
  } catch (err) {
    console.error('Error adding new summary:', err);
    res.status(500).send('Error adding new summary');
  }
});

// Update a specific summary
app.put('/summaries/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, summaryText } = req.body;
    await client.set(`summaries:${id}:title`, title);
    await client.set(`summaries:${id}:summaryText`, summaryText);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating summary:', err);
    res.status(500).send('Error updating summary');
  }
});

// Delete a specific summary
app.delete('/summaries/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    await client.del(`summaries:${id}:title`);
    await client.del(`summaries:${id}:summaryText`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting summary:', err);
    res.status(500).send('Error deleting summary');
  }
});

app.post('/save-modified-summary', ensureAuthenticated, async (req, res) => {
  const { subjectid, summary } = req.body;
  const summaryKey = `subject:${subjectid}:summary`;

  try {
    await client.set(summaryKey, summary);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving modified summary:', error);
    res.json({
      success: false,
      error: 'Error saving modified summary',
    });
  }
});

app.post('/update-merged-content', ensureAuthenticated, async (req, res) => {
  const { subjectid, mergedContent } = req.body;
  const cacheKey = `subject:${subjectid}:response`;

  console.log(`Received request to update content for ${subjectid}`);
  console.log(`Merged content: ${mergedContent}`);

  try {
    await client.set(cacheKey, mergedContent);
    console.log('Content updated successfully in Redis');
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving merged content:', error);
    res.json({
      success: false,
      error: 'Error saving merged content',
    });
  }
});

app.get('/results-format', ensureAuthenticated, (req, res) => {
  fs.readFile('results-format.txt', 'utf-8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading results format file');
    }
    try {
      const replacements = JSON.parse(data);
      res.json(replacements);
    } catch (err) {
      res.status(500).send('Error parsing results format file');
    }
  });
});

// API endpoints for Prompts

// Get all prompts
app.get('/prompts', ensureAuthenticated, async (req, res) => {
  try {
    const keys = await client.keys('prompts:*:title');
    const prompts = await Promise.all(
      keys.map(async (key) => {
        const id = key.split(':')[1];
        const title = await client.get(key);
        return { id, title };
      })
    );
    res.json({ success: true, prompts });
  } catch (err) {
    console.error('Error fetching prompts:', err);
    res.status(500).json({ success: false, error: 'Error fetching prompts' });
  }
});

// Get a specific prompt
app.get('/prompts/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const title = await client.get(`prompts:${id}:title`);
    const prompttext = await client.get(`prompts:${id}:prompttext`);
    
    if (!title || !prompttext) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }
    
    res.json({ success: true, prompt: { id, title, prompttext } });
  } catch (err) {
    console.error('Error fetching prompt:', err);
    res.status(500).json({ success: false, error: 'Error fetching prompt' });
  }
});

// Update a specific prompt
app.put('/prompts/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, prompttext } = req.body;
    await client.set(`prompts:${id}:title`, title);
    await client.set(`prompts:${id}:prompttext`, prompttext);
    res.json({ success: true, message: 'Prompt updated successfully' });
  } catch (err) {
    console.error('Error updating prompt:', err);
    res.status(500).json({ success: false, error: 'Error updating prompt' });
  }
});

// Delete a specific prompt
app.delete('/prompts/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    await client.del(`prompts:${id}:title`);
    await client.del(`prompts:${id}:prompttext`);
    res.json({ success: true, message: 'Prompt deleted successfully' });
  } catch (err) {
    console.error('Error deleting prompt:', err);
    res.status(500).json({ success: false, error: 'Error deleting prompt' });
  }
});

// Add a new prompt
app.post('/prompts', ensureAuthenticated, async (req, res) => {
  try {
    const { title, prompttext } = req.body;
    const newId = await client.incr('prompts_id_counter');
    await client.set(`prompts:${newId}:title`, title);
    await client.set(`prompts:${newId}:prompttext`, prompttext);
    res.json({ success: true, message: 'Prompt saved successfully', id: newId });
  } catch (err) {
    console.error('Error adding new prompt:', err);
    res.status(500).json({ success: false, error: 'Error adding new prompt' });
  }
});

// API endpoints for RWEs
async function getAllRwes() {
  const keys = await client.keys('rwe:*');
  const rwes = [];

  for (const key of keys) {
    const rweid = key.split(':')[1];
    const rwe = await getRweById(rweid);
    rwes.push({ rweid, ...rwe });
  }

  return rwes;
}

async function getRweById(rweid) {
  const hashKey = `rwe:${rweid}`;
  const rwe = await client.hGetAll(hashKey);

  if (Object.keys(rwe).length === 0) {
    throw new Error(`RWE with id ${rweid} does not exist`);
  }

  return rwe;
}

app.post('/add-rwe', ensureAuthenticated, async (req, res) => {
  const { threat, description, reference } = req.body;

  try {
    const rweid = await client.incr('rwe_id_counter');
    await createRweHash(rweid, threat, description, reference);
    res.json({ success: true });
  } catch (err) {
    console.error('Error adding RWE:', err);
    res.json({ success: false, error: 'Error adding RWE' });
  }
});

app.get('/list-rwes', ensureAuthenticated, async (req, res) => {
  try {
    const rwes = await getAllRwes();
    res.json({ success: true, rwes });
  } catch (err) {
    console.error('Error listing RWEs:', err);
    res.json({ success: false, error: 'Error listing RWEs' });
  }
});

const pageSize = 9; // 3x3 grid

app.get('/list-rwes-paginated', ensureAuthenticated, async (req, res) => {
  const page = parseInt(req.query.page) || 1;

  try {
    const rwes = await getAllRwes();
    const totalRwes = rwes.length;
    const totalPages = Math.ceil(totalRwes / pageSize);
    const paginatedRwes = rwes.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      success: true,
      rwes: paginatedRwes,
      totalPages,
      currentPage: page,
    });
  } catch (err) {
    console.error('Error listing RWEs:', err);
    res.json({ success: false, error: 'Error listing RWEs' });
  }
});

app.get('/get-rwe/:rweid', ensureAuthenticated, async (req, res) => {
  const { rweid } = req.params;

  try {
    const rwe = await getRweById(rweid);
    res.json({ success: true, rwe });
  } catch (err) {
    console.error('Error getting RWE:', err);
    res.json({ success: false, error: 'Error getting RWE' });
  }
});

app.post('/update-rwe/:rweid', ensureAuthenticated, async (req, res) => {
  const { rweid } = req.params;
  const { threat, description, reference } = req.body;
  const hashKey = `rwe:${rweid}`;

  try {
    await client.hSet(hashKey, { threat, description, reference });
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating RWE:', err);
    res.json({ success: false, error: 'Error updating RWE' });
  }
});

// Route to delete a specific RWE
app.delete('/delete-rwe/:rweid', ensureAuthenticated, async (req, res) => {
  const { rweid } = req.params;
  const hashKey = `rwe:${rweid}`;

  try {
    const result = await client.del(hashKey);
    if (result === 0) {
      return res.status(404).json({ success: false, error: 'RWE not found.' });
    }
    res.json({ success: true, message: 'RWE deleted successfully.' });
  } catch (err) {
    console.error('Error deleting RWE:', err);
    res.status(500).json({ success: false, error: 'Error deleting RWE.' });
  }
});

// Route to list all users
app.get('/list-users', ensureAuthenticated, async (req, res) => {
  try {
    const keys = await client.keys('user:*');
    const users = [];

    for (const key of keys) {
      const user = await client.hGetAll(key);
      users.push(user);
    }

    res.json({ success: true, users });
  } catch (err) {
    console.error('Error listing users:', err);
    res.status(500).json({ success: false, error: 'Error listing users.' });
  }
});

// Route to get a specific user's details
app.get('/get-user', ensureAuthenticated, async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required.' });
  }

  try {
    const user = await client.hGetAll(`user:${email}`);
    if (Object.keys(user).length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    res.json({ success: true, user });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ success: false, error: 'Error fetching user.' });
  }
});

// Route to update a specific user's details
app.post('/update-user', ensureAuthenticated, async (req, res) => {
  const email = req.query.email;
  const { name, registered, apiKey } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required.' });
  }

  if (!name || (registered !== 'true' && registered !== 'false')) {
    return res.status(400).json({ success: false, error: 'Invalid data provided.' });
  }

  try {
    await client.hSet(`user:${email}`, { name, registered, apiKey });
    res.json({ success: true, message: 'User updated successfully.' });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ success: false, error: 'Error updating user.' });
  }
});

// Route to delete a specific user
app.delete('/delete-user', ensureAuthenticated, async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required.' });
  }

  try {
    const result = await client.del(`user:${email}`);
    if (result === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ success: false, error: 'Error deleting user.' });
  }
});

// Route to reset or update a user's password
app.post('/reset-password', ensureAuthenticated, async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;
  
  if (!email || !newPassword || !confirmPassword) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email, new password, and confirmation are required.' 
    });
  }
  
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ 
      success: false, 
      error: 'New password and confirmation do not match.' 
    });
  }
  
  try {
    // Check if user exists
    const user = await client.hGetAll(`user:${email}`);
    if (Object.keys(user).length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    
    // Hash the new password
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Timestamp for verification
    const passwordUpdatedAt = Date.now().toString();
    
    // Update the user's password in Redis
    await client.hSet(`user:${email}`, { 
      hashedPassword,
      passwordUpdatedAt
    });
    
    // Create a verification record with timestamp for checking
    const verificationKey = `passwordReset:${email}:${passwordUpdatedAt}`;
    await client.set(verificationKey, 'completed');
    await client.expire(verificationKey, 60 * 60 * 24); // Expire after 24 hours
    
    res.json({ 
      success: true, 
      message: 'Password updated successfully.',
      verification: {
        timestamp: passwordUpdatedAt,
        verificationKey
      }
    });
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).json({ success: false, error: 'Error resetting password.' });
  }
});

// Route to verify a password change
app.get('/verify-password-reset', ensureAuthenticated, async (req, res) => {
  const { email, timestamp } = req.query;
  
  if (!email || !timestamp) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email and timestamp are required.' 
    });
  }
  
  try {
    // Check if the verification record exists
    const verificationKey = `passwordReset:${email}:${timestamp}`;
    const verificationStatus = await client.get(verificationKey);
    
    // Check the user record to confirm timestamp matches
    const user = await client.hGetAll(`user:${email}`);
    
    if (!verificationStatus) {
      return res.json({ 
        success: false, 
        verified: false,
        error: 'No verification record found. Password change may not have been successful.' 
      });
    }
    
    if (user.passwordUpdatedAt !== timestamp) {
      return res.json({ 
        success: false, 
        verified: false,
        error: 'Timestamp mismatch. Password may have been changed again since this reset.' 
      });
    }
    
    // Format date for human-readable output
    const resetDate = new Date(parseInt(timestamp));
    const formattedDate = resetDate.toLocaleString();
    
    res.json({ 
      success: true, 
      verified: true,
      message: `Password change verified successfully. The password for ${email} was reset on ${formattedDate}.`,
      email: email,
      resetTime: formattedDate
    });
  } catch (err) {
    console.error('Error verifying password reset:', err);
    res.status(500).json({ 
      success: false, 
      verified: false,
      error: 'Error verifying password reset.' 
    });
  }
});

// Login route
app.get('/login', (req, res) => {
  res.render('login');
});

// Route to display password reset page
app.get('/reset-password', ensureAuthenticated, (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.redirect('/');
  }
  res.render('reset-password', { user: req.user, email: email });
});

// Handle password reset form submission
app.post('/reset-password', ensureAuthenticated, async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;
  
  if (!email || !newPassword || !confirmPassword) {
    return res.status(400).json({
      success: false,
      error: 'All fields are required'
    });
  }
  
  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      error: 'Passwords do not match'
    });
  }
  
  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters long'
    });
  }
  
  try {
    // Get user by email
    const userKey = `user:${email}`;
    const user = await client.hGetAll(userKey);
    
    if (!user || Object.keys(user).length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Generate timestamp for verification
    const timestamp = Date.now().toString();
    
    // Update user password and timestamp
    await client.hSet(userKey, {
      password: hashedPassword,
      passwordUpdatedAt: timestamp
    });
    
    // Store verification record with expiration
    const verificationKey = `passwordReset:${email}:${timestamp}`;
    await client.set(verificationKey, 'true');
    await client.expire(verificationKey, 86400); // Expire after 24 hours
    
    res.json({
      success: true,
      message: 'Password reset successfully. Please verify this change to confirm.',
      verification: {
        timestamp: timestamp
      }
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      success: false,
      error: 'Server error. Please try again later.'
    });
  }
});

// Threat analysis and suggestions API endpoints
app.get('/analyze-threats/:subjectid', ensureAuthenticated, async (req, res) => {
  const { subjectid } = req.params;
  
  try {
    // Check if the subject exists
    const title = await client.get(`subject:${subjectid}:title`);
    if (!title) {
      return res.status(404).json({ success: false, error: 'Subject not found.' });
    }
    
    // Analyze the subject for missing threats
    const analysis = await app.locals.threatAnalyzer.analyzeSubjectThreatModel(subjectid);
    
    res.json({ success: true, analysis });
  } catch (err) {
    console.error('Error analyzing threats:', err);
    res.status(500).json({ success: false, error: 'Error analyzing threats.' });
  }
});

app.post('/apply-suggestions/:subjectid', ensureAuthenticated, async (req, res) => {
  const { subjectid } = req.params;
  const { suggestions } = req.body;
  
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return res.status(400).json({ success: false, error: 'Invalid suggestions format.' });
  }
  
  try {
    // Get the current response
    const currentResponse = await client.get(`subject:${subjectid}:response`);
    if (!currentResponse) {
      return res.status(404).json({ success: false, error: 'Subject response not found.' });
    }
    
    // Format the new suggestions according to the response format
    const formatsPath = path.join(__dirname, 'results-format.txt');
    const formatTemplate = fs.readFileSync(formatsPath, 'utf8');
    
    let newContent = currentResponse;
    
    // Add each suggestion in the proper format
    for (const suggestion of suggestions) {
      const formattedSuggestion = formatTemplate
        .replace('(threat)', suggestion.threat)
        .replace('(description)', suggestion.description)
        .replace('(mitigations)', suggestion.mitigation);
      
      newContent += '\n' + formattedSuggestion;
    }
    
    // Update the response in Redis
    await client.set(`subject:${subjectid}:response`, newContent);
    
    res.json({ success: true, updatedResponse: newContent });
  } catch (err) {
    console.error('Error applying suggestions:', err);
    res.status(500).json({ success: false, error: 'Error applying suggestions.' });
  }
});

// Endpoint to analyze threats for a subject
app.get('/analyze-threats/:subjectid', ensureAuthenticated, async (req, res) => {
  try {
    const { subjectid } = req.params;
    const username = req.session.username;
    
    // Get subject details
    const subjectText = await client.get(`subject:${subjectid}:text`);
    const responseText = await client.get(`subject:${subjectid}:response`);
    
    if (!subjectText || !responseText) {
      return res.status(404).json({ success: false, error: 'Subject not found' });
    }
    
    // Analyze the threat model
    const analysis = await app.locals.threatAnalyzer.analyzeModel(subjectid, subjectText, responseText);
    
    res.json({ success: true, analysis });
  } catch (err) {
    console.error('Error analyzing threats:', err);
    res.status(500).json({ success: false, error: 'Error analyzing threats' });
  }
});

// Endpoint to apply threat suggestions
app.post('/apply-suggestions/:subjectid', ensureAuthenticated, async (req, res) => {
  try {
    const { subjectid } = req.params;
    const { suggestions } = req.body;
    
    if (!suggestions || !Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid suggestions' });
    }
    
    // Get the current response
    let responseText = await client.get(`subject:${subjectid}:response`);
    
    if (!responseText) {
      return res.status(404).json({ success: false, error: 'Subject not found' });
    }
    
    // Apply suggestions to the response text
    const updatedResponse = await app.locals.threatAnalyzer.applySuggestions(responseText, suggestions);
    
    // Save the updated response
    await client.set(`subject:${subjectid}:response`, updatedResponse);
    
    res.json({ success: true, updatedResponse });
  } catch (err) {
    console.error('Error applying suggestions:', err);
    res.status(500).json({ success: false, error: 'Error applying suggestions' });
  }
});

// Test endpoint for the threat analyzer
app.get('/test-analyzer', ensureAuthenticated, async (req, res) => {
  try {
    const keyTerms = app.locals.threatAnalyzer.extractKeyTerms(
      'A web application with user authentication, payment processing, and file uploads'
    );
    const components = app.locals.threatAnalyzer.identifySystemComponents(
      'A web application with user authentication, payment processing, and file uploads'
    );
    
    res.json({
      success: true, 
      message: 'Threat analyzer is working correctly',
      keyTerms,
      components
    });
  } catch (err) {
    console.error('Error testing threat analyzer:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Error testing threat analyzer',
      message: err.message
    });
  }
});

// Initialize Redis connection and settings before starting the server
(async () => {
  try {
    // Connect to Redis
    await redisUtil.connect();
    console.log('Connected to Redis successfully!');
    
    // Initialize default settings if they don't exist
    await initializeDefaultSettings();
    
    // Log current LLM provider to verify settings
    const currentProvider = await getRedisValue('settings:llm:provider', 'openai');
    console.log(`Current LLM provider: ${currentProvider}`);
    
    // Start the server after Redis is ready
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
      
      // Initialize and schedule LLM API status checks (check every 60 minutes)
      scheduler.scheduleApiChecks(60);
    });
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
})();
