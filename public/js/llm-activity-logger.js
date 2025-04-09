/**
 * LLM Activity Logger - Displays real-time interaction with OpenAI
 */
// Global function to make the modal accessible from the console for debugging
function showLLMModal() {
  const modal = document.getElementById('llmActivityModal');
  if (!modal) {
    console.error('Modal element not found!');
    return;
  }
  
  // Force the modal to be visible with direct styling
  modal.classList.add('show');
  modal.style.display = 'block';
  modal.style.zIndex = '1050';
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('role', 'dialog');
  document.body.classList.add('modal-open');
  
  // Add backdrop if it doesn't exist
  if (!document.querySelector('.modal-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop fade show';
    backdrop.style.zIndex = '1040'; // Ensure proper z-index
    backdrop.style.display = 'block';
    document.body.appendChild(backdrop);
  }
  
  // Also setup forced content for testing
  const promptLog = document.getElementById('promptLog');
  const responseLog = document.getElementById('responseLog');
  const llmStatus = document.getElementById('llmStatus');
  
  if (promptLog) promptLog.innerHTML = '<code>Test prompt content</code>';
  if (responseLog) responseLog.innerHTML = '<code>Test response content</code>';
  if (llmStatus) {
    llmStatus.textContent = 'Testing';
    llmStatus.className = 'badge bg-info';
  }
  
  console.log('Modal should now be visible with test content');
  
  // Add forced completion button
  setTimeout(() => {
    const modalFooter = document.querySelector('.modal-footer');
    if (modalFooter) {
      const testCompleteBtn = document.createElement('button');
      testCompleteBtn.textContent = 'Complete Test';
      testCompleteBtn.className = 'btn btn-success me-2';
      testCompleteBtn.onclick = function() {
        if (llmStatus) {
          llmStatus.textContent = 'Completed';
          llmStatus.className = 'badge bg-success';
        }
      };
      modalFooter.prepend(testCompleteBtn);
    }
  }, 1000);
}

// Debug configuration
const DEBUG_CONFIG = {
  debugMode: false,
  sseConnectionEnabled: true, // Enable/disable SSE connection
  autoSubmitDelay: 1500, // How long to wait before submitting the form after showing modal
  sseConnectionTimeout: 10000, // How long to wait for SSE connection before showing timeout warning
  autoCompleteTimeout: 30000, // How long to wait before auto-completing the modal if stuck
};

// Try to load any saved config
try {
  const savedConfig = localStorage.getItem('llmLoggerConfig');
  if (savedConfig) {
    Object.assign(DEBUG_CONFIG, JSON.parse(savedConfig));
  }
} catch (err) {
  console.error('Error loading debug config:', err);
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('[LLM Logger] DOM Content Loaded');
  
  // Update debug info display
  const updateDebug = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  
  const logAction = (action) => {
    console.log('[LLM Logger]', action);
    updateDebug('lastAction', action);
  };
  
  // Update SSE status display
  const updateSSEStatus = (status, event = null, requestId = null) => {
    if (document.getElementById('sseStatus')) {
      document.getElementById('sseStatus').textContent = status;
    }
    
    if (event && document.getElementById('sseLastEvent')) {
      document.getElementById('sseLastEvent').textContent = event;
    }
    
    if (requestId && document.getElementById('sseRequestId')) {
      document.getElementById('sseRequestId').textContent = requestId;
    }
  };
  
  logAction('Script initialized');
  
  // Get references to form and modal elements
  const threatModelForm = document.getElementById('threatModelForm');
  console.log('[LLM Logger] Form element found:', !!threatModelForm);
  updateDebug('formCheck', !!threatModelForm ? 'Yes' : 'No');
  
  const llmActivityModal = document.getElementById('llmActivityModal');
  console.log('[LLM Logger] Modal element found:', !!llmActivityModal);
  updateDebug('modalCheck', !!llmActivityModal ? 'Yes' : 'No');
  
  // Find test button
  const testModalBtn = document.getElementById('testModalBtn');
  console.log('[LLM Logger] Test button found:', !!testModalBtn);
  
    // Check if Bootstrap is available
  updateDebug('bootstrapCheck', typeof bootstrap !== 'undefined' ? 'Yes' : 'No');
  
  // Setup debug mode toggle
  const debugModeToggle = document.getElementById('debugModeToggle');
  const advancedDebug = document.getElementById('advancedDebug');
  const forceModalBtn = document.getElementById('forceModalBtn');
  const clearStorageBtn = document.getElementById('clearStorageBtn');
  
  if (debugModeToggle) {
    // Set initial state from saved config
    debugModeToggle.checked = DEBUG_CONFIG.debugMode;
    if (DEBUG_CONFIG.debugMode && advancedDebug) {
      advancedDebug.classList.remove('d-none');
    }
    
    debugModeToggle.addEventListener('change', function() {
      DEBUG_CONFIG.debugMode = this.checked;
      logAction('Debug mode ' + (this.checked ? 'enabled' : 'disabled'));
      
      // Save to localStorage
      localStorage.setItem('llmLoggerConfig', JSON.stringify(DEBUG_CONFIG));
      
      // Toggle advanced debug panel
      if (advancedDebug) {
        if (this.checked) {
          advancedDebug.classList.remove('d-none');
        } else {
          advancedDebug.classList.add('d-none');
        }
      }
    });
  }
  
  // Setup force modal button
  if (forceModalBtn) {
    forceModalBtn.addEventListener('click', showLLMModal);
  }
  
  // Setup clear storage button
  if (clearStorageBtn) {
    clearStorageBtn.addEventListener('click', function() {
      localStorage.removeItem('llmLoggerConfig');
      logAction('Debug config cleared');
      alert('Debug configuration has been reset');
    });
  }
  
  // Listen for force close button
  const forceCloseBtn = document.getElementById('forceCloseBtn');
  if (forceCloseBtn) {
    forceCloseBtn.addEventListener('click', function() {
      logAction('Force close button clicked');
      try {
        // Close any active event source
        if (window.activeEventSource) {
          window.activeEventSource.close();
          logAction('Closed active event source');
        }
        
        // Try to remove modal via Bootstrap
        const bsModal = bootstrap.Modal.getInstance(document.getElementById('llmActivityModal'));
        if (bsModal) {
          bsModal.hide();
          logAction('Modal hidden via Bootstrap instance');
        } else {
          // Manual DOM cleanup
          const modal = document.getElementById('llmActivityModal');
          if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            modal.removeAttribute('aria-modal');
            modal.removeAttribute('role');
          }
          
          // Remove backdrop
          const backdrop = document.querySelector('.modal-backdrop');
          if (backdrop) backdrop.remove();
          
          // Restore body
          document.body.classList.remove('modal-open');
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
          
          logAction('Modal hidden via manual DOM manipulation');
        }
      } catch (err) {
        console.error('[LLM Logger] Error in force close:', err);
        // Last resort - refresh hint
        if (document.getElementById('status-message')) {
          document.getElementById('status-message').textContent = 'Error closing modal. Try refreshing the page.';
        }
      }
    });
  }
  
  // Add emergency button only in debug mode
  if (DEBUG_CONFIG.debugMode) {
    const extraTestBtn = document.createElement('button');
    extraTestBtn.textContent = 'EMERGENCY MODAL TEST';
    extraTestBtn.className = 'btn btn-danger mt-2';
    extraTestBtn.style.position = 'fixed';
    extraTestBtn.style.top = '10px';
    extraTestBtn.style.right = '10px';
    extraTestBtn.style.zIndex = '9999';
    extraTestBtn.onclick = showLLMModal;
    document.body.appendChild(extraTestBtn);
    logAction('Added emergency test button');
  }
  
  if (typeof bootstrap === 'undefined') {
    console.error('[LLM Logger] Bootstrap is not defined! Modal cannot be initialized.');
    
    // Try to load Bootstrap manually
    logAction('Attempting to load Bootstrap dynamically');
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js';
    script.async = true;
    script.onload = () => {
      updateDebug('bootstrapCheck', 'Yes - Dynamically Loaded');
      logAction('Bootstrap loaded dynamically');
      setTimeout(initializeComponents, 500);
    };
    document.head.appendChild(script);
    return;
  }
  
  // Bootstrap is available, initialize components
  initializeComponents();
  
  // Main function to initialize all components
  function initializeComponents() {
    // Reference to the logs and status elements
    const promptLog = document.getElementById('promptLog');
    const responseLog = document.getElementById('responseLog');
    const llmStatus = document.getElementById('llmStatus');
    const llmProgress = document.getElementById('llmProgress');
    const requestId = document.getElementById('requestId');
    const modelUsed = document.getElementById('modelUsed');
    const tokenCount = document.getElementById('tokenCount');
    const processingTime = document.getElementById('processingTime');
    
    // Attempts to initialize the modal
    let llmModal;
    try {
      llmModal = new bootstrap.Modal(llmActivityModal);
      console.log('[LLM Logger] Modal initialized successfully');
      logAction('Modal initialized');
    } catch (err) {
      console.error('[LLM Logger] Error initializing modal:', err);
      logAction('Modal initialization failed: ' + err.message);
      return;
    }
  
        // Function to escape HTML characters for safe display
    function escapeHTML(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
    
    // Function to update the modal content
    function updateStatus(status, progress) {
      llmStatus.textContent = status;
      
      // Update the progress bar
      if (progress !== undefined) {
        llmProgress.style.width = progress + '%';
        llmProgress.setAttribute('aria-valuenow', progress);
      }
      
      // Add different badge colors based on status
      llmStatus.className = 'badge';
      if (status === 'Completed') {
        llmStatus.classList.add('bg-success');
        llmProgress.style.width = '100%';
        llmProgress.classList.remove('progress-bar-animated');
      } else if (status.includes('Error')) {
        llmStatus.classList.add('bg-danger');
        llmProgress.classList.remove('progress-bar-animated');
      } else if (status === 'Processing') {
        llmStatus.classList.add('bg-primary');
      } else {
        llmStatus.classList.add('bg-info');
      }
    }
    
    // Add event listener to test button if it exists
    if (testModalBtn) {
      testModalBtn.addEventListener('click', function() {
        logAction('Test button clicked');
        
        try {
          // Reset logs for testing
          promptLog.innerHTML = '<code>Test prompt content</code>';
          responseLog.innerHTML = '<code>Test response content</code>';
          requestId.textContent = 'TEST-ID-' + Date.now();
          modelUsed.textContent = document.getElementById('aiModel')?.value || 'gpt-4';
          tokenCount.textContent = 'Test tokens';
          processingTime.textContent = 'Test time';
          
          // Show status
          updateStatus('Testing', 50);
          
          // Try multiple methods to show the modal
          logAction('Trying Bootstrap modal show method');
          llmModal.show();
          
          // Force the modal to be visible with direct styling
          setTimeout(() => {
            // Ensure the modal elements have the right classes and styles
            logAction('Applying direct styling to modal');
            // Apply direct styling
            document.getElementById('llmActivityModal').classList.add('show');
            document.getElementById('llmActivityModal').style.display = 'block';
            document.getElementById('llmActivityModal').style.zIndex = '1050';
            document.getElementById('llmActivityModal').setAttribute('aria-modal', 'true');
            document.getElementById('llmActivityModal').setAttribute('role', 'dialog');
            
            // Add modal backdrop
            if (!document.querySelector('.modal-backdrop')) {
              const backdrop = document.createElement('div');
              backdrop.className = 'modal-backdrop fade show';
              document.body.appendChild(backdrop);
            }
            
            document.body.classList.add('modal-open');
            logAction('Direct styling applied to modal');
          }, 100);
        } catch (err) {
          console.error('[LLM Logger] Error in test button handler:', err);
          logAction('Error showing test modal: ' + err.message);
          
          // Try direct DOM manipulation as fallback with more CSS properties
          try {
            llmActivityModal.style.display = 'block';
            llmActivityModal.style.zIndex = '1050';
            llmActivityModal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            llmActivityModal.style.overflow = 'auto';
            llmActivityModal.classList.add('show');
            llmActivityModal.setAttribute('aria-modal', 'true');
            llmActivityModal.setAttribute('role', 'dialog');
            document.body.classList.add('modal-open');
            
            // Add backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade show';
            backdrop.style.zIndex = '1040';
            backdrop.style.display = 'block';
            document.body.appendChild(backdrop);
            
            // Force modal dialog to be visible
            const modalDialog = llmActivityModal.querySelector('.modal-dialog');
            if (modalDialog) {
              modalDialog.style.display = 'block';
              modalDialog.style.margin = '1.75rem auto';
              modalDialog.style.opacity = '1';
            }
            
            logAction('Used enhanced direct DOM method to show modal');
          } catch (domErr) {
            console.error('[LLM Logger] DOM fallback also failed:', domErr);
          }
        }
      });
      
      logAction('Test button handler attached');
    }
  
  
  
    // Intercept form submission
    if (threatModelForm) {
      console.log('[LLM Logger] Adding submit event listener to form');
      threatModelForm.addEventListener('submit', function(e) {
        e.preventDefault();
        console.log('[LLM Logger] Form submitted!');
        logAction('Form submitted with values: ' + new FormData(threatModelForm).get('subject'));
        
        // Reset logs
        promptLog.innerHTML = '<code>Waiting for prompt...</code>';
        responseLog.innerHTML = '<code>Waiting for response...</code>';
        requestId.textContent = 'Processing...';
        modelUsed.textContent = document.getElementById('aiModel')?.value || 'gpt-4';
        tokenCount.textContent = 'Calculating...';
        processingTime.textContent = 'In progress...';
        
        // Update initial status
        updateStatus('Starting', 10);
        
        // Show the modal first with all available methods
        console.log('[LLM Logger] Attempting to show modal');
        try {
          // 1. Bootstrap method
          llmModal.show();
          console.log('[LLM Logger] Modal shown via Bootstrap');
          
          // 2. Direct DOM method for backup
          llmActivityModal.classList.add('show');
          llmActivityModal.style.display = 'block';
          llmActivityModal.style.zIndex = '1050';
          llmActivityModal.setAttribute('aria-modal', 'true');
          llmActivityModal.setAttribute('role', 'dialog');
          document.body.classList.add('modal-open');
          
          // 3. Add backdrop if missing
          if (!document.querySelector('.modal-backdrop')) {
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade show';
            backdrop.style.zIndex = '1040';
            backdrop.style.display = 'block';
            document.body.appendChild(backdrop);
          }
          
          logAction('Modal shown with multiple techniques');
        } catch (err) {
          console.error('[LLM Logger] Error showing modal:', err);
          logAction('Error showing modal: ' + err.message);
        }
        
        // Set up SSE connection before submitting the form
        setupEventSource();
        
        // Add a force complete button in case of getting stuck
        setTimeout(() => {
          if (llmStatus.textContent !== 'Completed') {
            const forceSubmitBtn = document.createElement('button');
            forceSubmitBtn.textContent = 'Continue Anyway';
            forceSubmitBtn.className = 'btn btn-warning me-2';
            document.querySelector('.modal-footer').prepend(forceSubmitBtn);
            
            forceSubmitBtn.addEventListener('click', function() {
              logAction('Manual form submission triggered');
              // Submit the form
              forceSubmitBtn.disabled = true;
              forceSubmitBtn.textContent = 'Submitting...';
              submitFormWithoutEventListener();
            });
          }
        }, 5000); // Add force continue button after 5 seconds
        
        // Submit the form after giving SSE time to connect
        setTimeout(() => {
          logAction('Submitting form after SSE setup');
          submitFormWithoutEventListener();
        }, 1500);
      });
      
      // Helper function to submit the form without triggering the event listener again
      function submitFormWithoutEventListener() {
        // Create a clone of the form
        const clone = threatModelForm.cloneNode(true);
        // Replace the original form with the clone
        threatModelForm.parentNode.replaceChild(clone, threatModelForm);
        // Submit the clone
        clone.submit();
      }
      
      logAction('Form submit listener attached');
    }
  
    // Setup SSE (Server-Sent Events) to get real-time updates from the server
    function setupEventSource() {
      logAction('Setting up event source');
      updateSSEStatus('Connecting...'); 
      
      // First update the status display
      const statusMsg = document.getElementById('status-message');
      if (statusMsg) statusMsg.textContent = 'Connecting to server...';  

      // Update the UI to show we're attempting to connect
      promptLog.innerHTML = '<code>Connecting to server...</code>';
      responseLog.innerHTML = '<code>Waiting for server response...</code>';
      
      // Skip SSE if disabled in debug mode
      if (DEBUG_CONFIG.debugMode && !DEBUG_CONFIG.sseConnectionEnabled) {
        logAction('SSE connection disabled in debug mode');
        updateSSEStatus('Disabled in debug mode');
        if (statusMsg) statusMsg.textContent = 'SSE disabled in debug mode';
        return null;
      }
      
      // Reset any existing event source
      if (window.activeEventSource) {
        window.activeEventSource.close();
        logAction('Closed previous event source');
      }
      
      let eventSource;
      
      // Add a timeout to handle stuck connections
      const connectionTimeout = setTimeout(() => {
        logAction('Connection timeout - processing may still happen in background');
        updateStatus('Timeout, processing in background', 80);
        updateSSEStatus('Connection timeout');
        
        // Add a button to force completion
        const forceCompleteBtn = document.createElement('button');
        forceCompleteBtn.textContent = 'Force Complete';
        forceCompleteBtn.className = 'btn btn-warning mt-2';
        document.querySelector('.modal-footer').prepend(forceCompleteBtn);
        
        forceCompleteBtn.addEventListener('click', function() {
          logAction('Force complete clicked');
          updateStatus('Completed (Forced)', 100);
          if (eventSource) eventSource.close();
          updateSSEStatus('Force completed');
        });
      }, DEBUG_CONFIG.sseConnectionTimeout);
      
      try {
        eventSource = new EventSource('/llm-status');
        logAction('EventSource created - URL: /llm-status');
        updateSSEStatus('Created connection');
        
        // Update status message
        const statusMsg = document.getElementById('status-message');
        if (statusMsg) statusMsg.textContent = 'SSE connection created';
        
        // Add to console for debugging
        console.log('[LLM Logger] EventSource created:', eventSource);
      } catch (err) {
        console.error('[LLM Logger] Error creating EventSource:', err);
        logAction('Error creating EventSource: ' + err.message);
        updateSSEStatus('Connection error: ' + err.message);
        
        // Show error in the modal
        const statusMsg = document.getElementById('status-message');
        if (statusMsg) statusMsg.textContent = 'Error connecting: ' + err.message;
        
        promptLog.innerHTML = '<code class="text-danger">Failed to connect to server. See console for details.</code>';
        clearTimeout(connectionTimeout);
        return null;
      }
    
      eventSource.addEventListener('open', function(e) {
        clearTimeout(connectionTimeout); // Clear the timeout on successful connection
        logAction('Connection to server established');
        console.log('[LLM Logger] SSE connection opened:', e);
        updateStatus('Connected', 20);
        updateSSEStatus('Connected', 'open');
        
        // Update UI to show successful connection
        const statusMsg = document.getElementById('status-message');
        if (statusMsg) statusMsg.textContent = 'Connected to server successfully';
        promptLog.innerHTML = '<code class="text-success">Server connection established!</code>';
      });
      
      eventSource.addEventListener('prompt', function(e) {
        logAction('Received prompt event');
        try {
          const data = JSON.parse(e.data);
          promptLog.innerHTML = `<code>${escapeHTML(data.prompt)}</code>`;
          updateStatus('Processing', 40);
          updateSSEStatus('Processing', 'prompt', data.requestId);
          
          if (DEBUG_CONFIG.debugMode) {
            console.log('[LLM Logger] Prompt data:', data);
          }
        } catch (err) {
          console.error('[LLM Logger] Error parsing prompt data:', err);
          updateSSEStatus('Error parsing data');
        }
      });
      
      eventSource.addEventListener('processing', function(e) {
        logAction('Received processing event');
        try {
          const data = JSON.parse(e.data);
          updateStatus('Processing', 60);
          
          // Update details
          if (data.requestId) {
            requestId.textContent = data.requestId;
            updateSSEStatus('Processing', 'processing', data.requestId);
          }
          if (data.model) modelUsed.textContent = data.model;
          if (data.status) logAction('Status update: ' + data.status);
          
          if (DEBUG_CONFIG.debugMode) {
            console.log('[LLM Logger] Processing data:', data);
          }
        } catch (err) {
          console.error('[LLM Logger] Error parsing processing data:', err);
          updateSSEStatus('Error parsing data');
        }
      });
      
      eventSource.addEventListener('response', function(e) {
        logAction('Received response event');
        try {
          const data = JSON.parse(e.data);
          responseLog.innerHTML = `<code>${escapeHTML(data.response)}</code>`;
          updateStatus('Completed', 100);
          
          // Update tokens and processing time
          if (data.tokens) tokenCount.textContent = data.tokens;
          if (data.processingTime) processingTime.textContent = data.processingTime + ' seconds';
          if (data.requestId) updateSSEStatus('Completed', 'response', data.requestId);
          
          if (DEBUG_CONFIG.debugMode) {
            console.log('[LLM Logger] Response data:', data);
          }
          
          // Close the event source when done
          eventSource.close();
        } catch (err) {
          console.error('[LLM Logger] Error parsing response data:', err);
          updateSSEStatus('Error parsing response');
        }
      });
      
      eventSource.addEventListener('error', function(e) {
        console.error('[LLM Logger] Error with SSE connection:', e);
        logAction('SSE connection error: ' + (e.message || 'Unknown error'));
        updateSSEStatus('Connection error', 'error');
        
        // Add error details to the modal
        responseLog.innerHTML = '<code class="text-danger">Error communicating with the server. Check console for details.</code>';
        responseLog.innerHTML += `<p class="small text-danger mt-2">Error occurred at: ${new Date().toLocaleTimeString()}</p>`;
        
        updateStatus('Error Occurred', 100);
        
        // Update UI with error message
        const statusMsg = document.getElementById('status-message');
        if (statusMsg) statusMsg.textContent = 'Connection error. Try refreshing the page.';
        
        // Create a retry button if it doesn't exist
        if (!document.getElementById('retryBtn')) {
          const retryBtn = document.createElement('button');
          retryBtn.id = 'retryBtn';
          retryBtn.textContent = 'Retry Connection';
          retryBtn.className = 'btn btn-outline-primary me-2';
          document.querySelector('.modal-footer').prepend(retryBtn);
          
          retryBtn.addEventListener('click', function() {
            logAction('Retry connection clicked');
            // Close old connection and create new one
            if (eventSource) eventSource.close();
            setupEventSource();
            retryBtn.disabled = true;
            retryBtn.textContent = 'Retrying...';
          });
        }
        
        // Close the event source on error
        eventSource.close();
        window.activeEventSource = null;
      });
      
      // Add a debug message after connection
      setTimeout(() => {
        logAction('Testing event source connection state');
        if (eventSource.readyState === 0) {
          responseLog.innerHTML += '<code>EventSource is connecting...</code>';
        } else if (eventSource.readyState === 1) {
          responseLog.innerHTML += '<code>EventSource is open and working!</code>';
        } else {
          responseLog.innerHTML += '<code>EventSource is closed or errored</code>';
        }
      }, 1000);
      
      // Close event source when modal is closed
      llmActivityModal.addEventListener('hidden.bs.modal', function() {
        logAction('Modal closed, closing event source');
        if (eventSource) {
          eventSource.close();
          logAction('Event source closed');
        }
      });
      
      // Store reference to event source globally for force close access
      window.activeEventSource = eventSource;
    }
  } // End of initializeComponents function
});
