/**
 * Service Status Checker
 * 
 * Periodically checks Redis and OpenAI status and updates the indicators
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize tooltips
  const initializeTooltips = () => {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl);
    });
  };

  // Initial status indicators
  const redisIndicator = document.getElementById('redis-status');
  const openaiIndicator = document.getElementById('openai-status');
  
  if (redisIndicator && openaiIndicator) {
    // Set initial loading state
    redisIndicator.classList.add('loading');
    openaiIndicator.classList.add('loading');
    
    // Initialize tooltips
    initializeTooltips();
    
    // Function to update status indicators
    const updateStatusIndicators = (redisStatus, openaiStatus) => {
      // Update Redis status
      redisIndicator.classList.remove('loading', 'online', 'offline');
      redisIndicator.classList.add(redisStatus ? 'online' : 'offline');
      redisIndicator.setAttribute('title', `Redis: ${redisStatus ? 'Online' : 'Offline'}`);
      
      // Update OpenAI status
      openaiIndicator.classList.remove('loading', 'online', 'offline');
      openaiIndicator.classList.add(openaiStatus ? 'online' : 'offline');
      openaiIndicator.setAttribute('title', `OpenAI: ${openaiStatus ? 'Online' : 'Offline'}`);
      
      // Refresh tooltips
      const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.forEach(function (tooltipTriggerEl) {
        const tooltip = bootstrap.Tooltip.getInstance(tooltipTriggerEl);
        if (tooltip) {
          tooltip.dispose();
          new bootstrap.Tooltip(tooltipTriggerEl);
        }
      });
    };
    
    // Function to check service status
    const checkServiceStatus = async () => {
      try {
        const response = await fetch('/api/status');
        if (response.ok) {
          const data = await response.json();
          updateStatusIndicators(data.redis, data.openai);
          console.log('Service status:', data);
        } else {
          console.error('Failed to fetch service status:', response.statusText);
          updateStatusIndicators(false, false);
        }
      } catch (error) {
        console.error('Error checking service status:', error);
        updateStatusIndicators(false, false);
      }
    };
    
    // Check status immediately
    checkServiceStatus();
    
    // Then check every 30 seconds
    setInterval(checkServiceStatus, 30000);
  }
});
