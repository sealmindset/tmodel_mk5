/**
 * OpenAI API Monitor
 * 
 * This script manages the OpenAI API Monitor modal, which displays real-time
 * information about API requests and responses.
 */

document.addEventListener('DOMContentLoaded', function() {
  console.log('OpenAI Monitor: Initializing...');
  // DOM Elements
  const modal = document.getElementById('openaiMonitorModal');
  const eventsContainer = document.getElementById('api-events-container');
  const eventsList = document.getElementById('events-list');
  const noEventsMessage = document.getElementById('no-events-message');
  const eventsCountEl = document.getElementById('events-count');
  const apiStatusBadge = document.getElementById('api-status-badge');
  const refreshBtn = document.getElementById('refresh-events-btn');
  const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
  const clearEventsBtn = document.getElementById('clear-events-btn');
  const filterButtons = document.querySelectorAll('.filter-btn');
  const template = document.getElementById('event-item-template');
  
  // State variables
  let events = [];
  let autoRefreshInterval = null;
  let currentFilter = 'all';
  const AUTO_REFRESH_INTERVAL = 3000; // 3 seconds
  
  // Initialize the monitor when the modal is first shown
  if (modal) {
    console.log('OpenAI Monitor: Modal element found');
    modal.addEventListener('show.bs.modal', function() {
      console.log('OpenAI Monitor: Modal shown');
      fetchEvents();
    });
    
    // Set up auto-refresh toggle
    if (autoRefreshToggle) {
      autoRefreshToggle.addEventListener('change', toggleAutoRefresh);
      // Initial setup of auto-refresh
      if (autoRefreshToggle.checked) {
        startAutoRefresh();
      }
    }
    
    // Manual refresh button
    if (refreshBtn) {
      refreshBtn.addEventListener('click', fetchEvents);
    }
    
    // Clear events button
    if (clearEventsBtn) {
      clearEventsBtn.addEventListener('click', clearEvents);
    }
    
    // Filter buttons
    if (filterButtons) {
      filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
          // Update active button
          filterButtons.forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          
          // Apply filter
          currentFilter = this.dataset.filter;
          renderEvents();
        });
      });
    }
    
    // Handle modal close - stop auto refresh
    modal.addEventListener('hidden.bs.modal', function() {
      stopAutoRefresh();
    });
  } else {
    console.error('OpenAI Monitor: Modal element not found');
    // Create a debug message on the page
    const debugDiv = document.createElement('div');
    debugDiv.className = 'alert alert-warning fixed-bottom m-3';
    debugDiv.innerHTML = 'OpenAI Monitor: Modal not found. Check the console for details.';
    document.body.appendChild(debugDiv);
    
    // Try to find the closest match to the modal ID
    const allModals = document.querySelectorAll('.modal');
    console.log('Available modals:', allModals.length);
    allModals.forEach((m, i) => {
      console.log(`Modal ${i}:`, m.id);
    });
  }
  
  /**
   * Start auto-refreshing events
   */
  function startAutoRefresh() {
    stopAutoRefresh(); // Clear any existing interval first
    autoRefreshInterval = setInterval(fetchEvents, AUTO_REFRESH_INTERVAL);
  }
  
  /**
   * Stop auto-refreshing events
   */
  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }
  
  /**
   * Toggle auto-refresh based on checkbox state
   */
  function toggleAutoRefresh() {
    if (this.checked) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  }
  
  /**
   * Fetch events from the API
   */
  function fetchEvents() {
    console.log('OpenAI Monitor: Fetching events...');
    // Add spinner to refresh button
    if (refreshBtn) {
      refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Refreshing...';
      refreshBtn.disabled = true;
    }
    
    fetch('/api/openai/events')
      .then(response => {
        console.log('OpenAI Monitor: Response status:', response.status);
        if (!response.ok) {
          throw new Error(`Failed to fetch events: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('OpenAI Monitor: Received events:', data ? data.length : 0);
        events = data || [];
        updateApiStatus(true);
        renderEvents();
      })
      .catch(error => {
        console.error('Error fetching events:', error);
        updateApiStatus(false);
        // Show error in the events container
        if (eventsList) {
          eventsList.innerHTML = `<div class="alert alert-danger m-3">Error loading events: ${error.message}</div>`;
          noEventsMessage.classList.add('d-none');
          eventsList.classList.remove('d-none');
        }
      })
      .finally(() => {
        // Restore refresh button
        if (refreshBtn) {
          refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh';
          refreshBtn.disabled = false;
        }
      });
  }
  
  /**
   * Update the API status indicator
   */
  function updateApiStatus(isOnline) {
    if (apiStatusBadge) {
      if (isOnline) {
        apiStatusBadge.className = 'badge bg-success ms-2';
        apiStatusBadge.textContent = 'Connected';
      } else {
        apiStatusBadge.className = 'badge bg-danger ms-2';
        apiStatusBadge.textContent = 'Disconnected';
      }
    }
  }
  
  /**
   * Clear all events
   */
  function clearEvents() {
    events = [];
    renderEvents();
  }
  
  /**
   * Render events based on current filter
   */
  function renderEvents() {
    if (!eventsList || !noEventsMessage || !eventsCountEl) return;
    
    // Filter events based on current filter
    const filteredEvents = currentFilter === 'all' 
      ? events 
      : events.filter(event => event.type === currentFilter);
    
    // Update events count
    eventsCountEl.textContent = `${filteredEvents.length} event${filteredEvents.length !== 1 ? 's' : ''}`;
    
    // Clear existing events
    eventsList.innerHTML = '';
    
    // Show/hide no events message
    if (filteredEvents.length === 0) {
      noEventsMessage.classList.remove('d-none');
      eventsList.classList.add('d-none');
      return;
    } else {
      noEventsMessage.classList.add('d-none');
      eventsList.classList.remove('d-none');
    }
    
    // Render each event
    filteredEvents.forEach(event => {
      const eventEl = createEventElement(event);
      eventsList.appendChild(eventEl);
    });
    
    // Set up toggle buttons for event details
    document.querySelectorAll('.toggle-details').forEach(button => {
      button.addEventListener('click', function() {
        const collapseId = this.getAttribute('data-target');
        const collapseEl = document.getElementById(collapseId);
        
        if (collapseEl.classList.contains('show')) {
          collapseEl.classList.remove('show');
          this.textContent = 'Show details';
        } else {
          collapseEl.classList.add('show');
          this.textContent = 'Hide details';
        }
      });
    });
  }
  
  /**
   * Create an event element from template
   */
  function createEventElement(event) {
    if (!template) return document.createElement('div');
    
    const clone = template.content.cloneNode(true);
    const eventEl = clone.querySelector('.event-item');
    
    // Add event type class
    eventEl.classList.add(`event-${event.type}`);
    
    // Set event badge
    const badgeEl = clone.querySelector('.event-type');
    switch (event.type) {
      case 'request':
        badgeEl.textContent = 'Request';
        badgeEl.classList.add('bg-primary');
        break;
      case 'response':
        badgeEl.textContent = 'Response';
        badgeEl.classList.add('bg-success');
        break;
      case 'error':
        badgeEl.textContent = 'Error';
        badgeEl.classList.add('bg-danger');
        break;
      default:
        badgeEl.textContent = event.type;
        badgeEl.classList.add('bg-secondary');
    }
    
    // Set timestamp
    const timeEl = clone.querySelector('.event-time');
    const timestamp = new Date(event.timestamp);
    timeEl.textContent = timestamp.toLocaleTimeString();
    
    // Set summary
    const summaryEl = clone.querySelector('.event-summary');
    if (event.type === 'request') {
      const model = event.data.model || 'Unknown model';
      const promptPreview = event.data.prompt ? 
        `"${event.data.prompt.substring(0, 50)}${event.data.prompt.length > 50 ? '...' : ''}"` : 
        'No prompt data';
      summaryEl.innerHTML = `<strong>Model:</strong> ${model}<br><strong>Prompt:</strong> ${promptPreview}`;
    } else if (event.type === 'response') {
      let responseText = '';
      if (event.data.choices && event.data.choices.length > 0) {
        if (event.data.choices[0].message) {
          responseText = event.data.choices[0].message.content || '';
        } else {
          responseText = event.data.choices[0].text || '';
        }
      }
      
      const usage = event.data.usage ? 
        `(${event.data.usage.total_tokens || 0} tokens used)` : 
        '';
      
      const responsePreview = responseText ? 
        `"${responseText.substring(0, 50)}${responseText.length > 50 ? '...' : ''}"` : 
        'No response text';
        
      summaryEl.innerHTML = `<strong>Response:</strong> ${responsePreview}<br><strong>Usage:</strong> ${usage}`;
    } else if (event.type === 'error') {
      summaryEl.innerHTML = `<strong>Error:</strong> ${event.data.message || 'Unknown error'}`;
    }
    
    // Set data and configure collapse
    const collapseId = `collapse-${event.id}`;
    const collapseEl = clone.querySelector('.collapse');
    collapseEl.id = collapseId;
    
    const toggleBtn = clone.querySelector('.toggle-details');
    toggleBtn.setAttribute('data-target', collapseId);
    
    const dataEl = clone.querySelector('.event-data');
    dataEl.textContent = JSON.stringify(event.data, null, 2);
    
    return eventEl;
  }
  
  // Export functions for global access
  window.openaiMonitor = {
    refresh: fetchEvents,
    clear: clearEvents,
    toggle: function() {
      const modalInstance = bootstrap.Modal.getOrCreateInstance(modal);
      modalInstance.toggle();
    }
  };
});

// Add a keyboard shortcut to open the monitor (Ctrl+Shift+O)
document.addEventListener('keydown', function(event) {
  if (event.ctrlKey && event.shiftKey && event.key === 'O') {
    if (window.openaiMonitor) {
      window.openaiMonitor.toggle();
    }
  }
});
