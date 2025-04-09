/**
 * Debug routes for testing functionality
 */
const express = require('express');
const router = express.Router();
const openaiUtil = require('../utils/openai');

/**
 * @route GET /debug/openai-test
 * @desc Test OpenAI API integration with a simple form
 */
router.get('/openai-test', async (req, res) => {
  let apiKey = openaiUtil.getApiKey();
  let status = false;
  
  try {
    status = await openaiUtil.checkStatus();
  } catch (error) {
    console.error('Error checking OpenAI status:', error);
  }
  
  // Mask the API key for display
  let maskedKey = '';
  if (apiKey) {
    const keyLength = apiKey.length;
    if (keyLength > 8) {
      maskedKey = `${apiKey.substring(0, 4)}${'*'.repeat(keyLength - 8)}${apiKey.substring(keyLength - 4)}`;
    } else {
      maskedKey = '********';
    }
  }
  
  res.render('debug/openai-test', {
    apiKey: maskedKey,
    apiStatus: status,
    messages: []
  });
});

/**
 * @route POST /debug/openai-test
 * @desc Test a prompt with the OpenAI API
 */
router.post('/openai-test', async (req, res) => {
  const { prompt } = req.body;
  let apiKey = openaiUtil.getApiKey();
  let status = false;
  let messages = [];
  
  try {
    status = await openaiUtil.checkStatus();
    
    if (status && prompt) {
      // Try to get a completion using the prompt
      try {
        const response = await openaiUtil.getCompletion(prompt);
        
        let responseText = '';
        if (response.choices && response.choices.length > 0) {
          if (response.choices[0].message) {
            responseText = response.choices[0].message.content || '';
          } else {
            responseText = response.choices[0].text || '';
          }
        }
        
        messages.push({
          type: 'success',
          text: `Prompt successfully sent. OpenAI response: "${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}"`
        });
      } catch (error) {
        messages.push({
          type: 'danger',
          text: `Error getting completion: ${error.message}`
        });
      }
    } else if (!status) {
      messages.push({
        type: 'warning',
        text: 'OpenAI API is not accessible. Check your API key.'
      });
    } else if (!prompt) {
      messages.push({
        type: 'warning',
        text: 'Please enter a prompt.'
      });
    }
  } catch (error) {
    console.error('Error in OpenAI test:', error);
    messages.push({
      type: 'danger',
      text: `Error: ${error.message}`
    });
  }
  
  // Mask the API key for display
  let maskedKey = '';
  if (apiKey) {
    const keyLength = apiKey.length;
    if (keyLength > 8) {
      maskedKey = `${apiKey.substring(0, 4)}${'*'.repeat(keyLength - 8)}${apiKey.substring(keyLength - 4)}`;
    } else {
      maskedKey = '********';
    }
  }
  
  res.render('debug/openai-test', {
    apiKey: maskedKey,
    apiStatus: status,
    messages,
    lastPrompt: prompt
  });
});

module.exports = router;
