/**
 * Dashboard JavaScript for Threat Model Generator MK5
 * Initializes charts and handles dashboard functionality
 */

document.addEventListener('DOMContentLoaded', function() {
  initializeDashboard();
  
  // Refresh stats button
  const refreshBtn = document.getElementById('refreshStats');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      refreshStats();
    });
  }
});

/**
 * Initialize dashboard components and charts
 */
function initializeDashboard() {
  try {
    // Get chart data from the hidden JSON element
    const chartDataElement = document.getElementById('chartData');
    if (!chartDataElement) {
      console.error('Chart data element not found');
      return;
    }
    
    const chartData = JSON.parse(chartDataElement.textContent);
    
    // Initialize charts
    initializeModelsByMonthChart(chartData);
    initializeThreatCategoriesChart(chartData);
    
    console.log('Dashboard initialized successfully');
  } catch (error) {
    console.error('Error initializing dashboard:', error);
    showErrorToast('Failed to initialize dashboard charts');
  }
}

/**
 * Initialize the Operating Environments chart
 */
function initializeModelsByMonthChart(chartData) {
  const modelsByMonth = chartData.modelsByMonth || [];
  const ctx = document.getElementById('modelsChart');
  
  if (!ctx) {
    console.error('Operating Environments chart canvas not found');
    return;
  }
  
  const labels = modelsByMonth.map(item => item.month);
  const data = modelsByMonth.map(item => item.count);
  
  // Custom options for the Operating Environments chart
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',  // Slightly thicker doughnut
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 15,
          padding: 15,
          font: {
            size: 12
          }
        }
      }
    }
  };
  
  createDoughnutChart(ctx, data, labels, 'Operating Environments', options);
}

/**
 * Initialize the Threat Categories chart
 */
function initializeThreatCategoriesChart(chartData) {
  const topCategories = chartData.topThreatCategories || [];
  const ctx = document.getElementById('categoriesChart');
  
  if (!ctx) {
    console.error('Categories chart canvas not found');
    return;
  }
  
  const labels = topCategories.map(item => item.category);
  const data = topCategories.map(item => item.count);
  
  createDoughnutChart(ctx, data, labels, 'Top Threat Categories');
}

/**
 * Refresh dashboard statistics via AJAX
 */
function refreshStats() {
  fetch('/api/dashboard-stats')
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch updated stats');
      }
      return response.json();
    })
    .then(data => {
      updateDashboardStats(data);
      showSuccessToast('Dashboard statistics refreshed');
    })
    .catch(error => {
      console.error('Error refreshing stats:', error);
      showErrorToast('Failed to refresh dashboard statistics');
    });
}

/**
 * Update dashboard statistics with new data
 */
function updateDashboardStats(data) {
  // Update stat values
  document.querySelectorAll('.stat-value').forEach(element => {
    const statName = element.getAttribute('data-stat');
    if (statName && data[statName] !== undefined) {
      let value = data[statName];
      
      // Format decimal values
      if (typeof value === 'number' && !Number.isInteger(value)) {
        value = value.toFixed(1);
      }
      
      element.textContent = value;
    }
  });
  
  // Reinitialize charts
  initializeModelsByMonthChart(data);
  initializeThreatCategoriesChart(data);
}

/**
 * Show a success toast notification
 */
function showSuccessToast(message) {
  showToast(message, 'success');
}

/**
 * Show an error toast notification
 */
function showErrorToast(message) {
  showToast(message, 'danger');
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    console.error('Toast container not found');
    return;
  }
  
  const toastId = 'toast-' + Date.now();
  const html = `
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header">
        <strong class="me-auto">Dashboard</strong>
        <small>Just now</small>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body bg-${type} text-white">
        ${message}
      </div>
    </div>
  `;
  
  toastContainer.insertAdjacentHTML('beforeend', html);
  
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, { delay: 3000 });
  toast.show();
  
  // Remove the toast element after it's hidden
  toastElement.addEventListener('hidden.bs.toast', function() {
    toastElement.remove();
  });
}
