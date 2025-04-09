/**
 * Threat Model Generator - Modern UI Enhancement
 * Main JavaScript file for improved user experience
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize tooltips
  initTooltips();
  
  // Initialize form validation
  initFormValidation();
  
  // Add loading indicators to buttons
  addLoadingIndicators();
  
  // Initialize collapsible cards
  initCollapsibleCards();
  
  // Initialize confirm actions
  initConfirmActions();
});

/**
 * Initialize Bootstrap tooltips
 */
function initTooltips() {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function(tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
}

/**
 * Initialize form validation with visual feedback
 */
function initFormValidation() {
  const forms = document.querySelectorAll('.needs-validation');
  Array.from(forms).forEach(form => {
    form.addEventListener('submit', event => {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add('was-validated');
    }, false);
  });
  
  // Add input validation feedback
  const inputs = document.querySelectorAll('.form-control, .form-select');
  inputs.forEach(input => {
    input.addEventListener('blur', function() {
      if (this.checkValidity()) {
        this.classList.add('is-valid');
        this.classList.remove('is-invalid');
      } else if (this.value) {
        this.classList.add('is-invalid');
        this.classList.remove('is-valid');
      }
    });
  });
}

/**
 * Add loading indicators to buttons when forms are submitted
 */
function addLoadingIndicators() {
  const buttons = document.querySelectorAll('button[type="submit"]');
  buttons.forEach(button => {
    button.addEventListener('click', function() {
      if (!this.form || (this.form && this.form.checkValidity())) {
        const originalText = this.innerHTML;
        this.setAttribute('data-original-text', originalText);
        this.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
        this.disabled = true;
        
        // Reset button after timeout (in case of network errors)
        setTimeout(() => {
          if (this.disabled) {
            this.innerHTML = this.getAttribute('data-original-text');
            this.disabled = false;
          }
        }, 10000);
      }
    });
  });
}

/**
 * Initialize collapsible card functionality
 */
function initCollapsibleCards() {
  const toggleButtons = document.querySelectorAll('[data-bs-toggle="collapse"]');
  toggleButtons.forEach(button => {
    button.addEventListener('click', function() {
      const target = document.querySelector(this.getAttribute('data-bs-target'));
      const icon = this.querySelector('i');
      
      if (icon) {
        if (target.classList.contains('show')) {
          icon.classList.remove('bi-chevron-up');
          icon.classList.add('bi-chevron-down');
        } else {
          icon.classList.remove('bi-chevron-down');
          icon.classList.add('bi-chevron-up');
        }
      }
    });
  });
}

/**
 * Initialize confirm action dialogs
 */
function initConfirmActions() {
  const confirmButtons = document.querySelectorAll('[data-confirm]');
  confirmButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      const message = this.getAttribute('data-confirm-message') || 'Are you sure you want to proceed?';
      
      if (confirm(message)) {
        if (this.tagName === 'A') {
          window.location.href = this.getAttribute('href');
        } else if (this.form) {
          this.form.submit();
        }
      }
    });
  });
}

/**
 * Close a modal and ensure the backdrop is properly removed
 * @param {string} modalId - ID of the modal to close
 */
function closeModalWithBackdrop(modalId) {
  const modalElement = document.getElementById(modalId);
  if (!modalElement) return;
  
  const modalInstance = bootstrap.Modal.getInstance(modalElement);
  if (modalInstance) {
    modalInstance.hide();
    
    // Remove the modal backdrop
    setTimeout(() => {
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.remove();
      }
      // Also remove modal-open class from body
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }, 150); // Small delay to let Bootstrap finish its hiding animation
  }
}

/**
 * Show a toast notification message
 * @param {string} message - Message to display
 * @param {string} type - Type of toast (success, danger, warning, info)
 */
function showToast(message, type = 'info') {
  // Create toast container if it doesn't exist
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastContainer);
  }
  
  // Create toast element
  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');
  
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  
  toastContainer.appendChild(toastEl);
  
  // Initialize and show the toast
  const toast = new bootstrap.Toast(toastEl, { autohide: true, delay: 5000 });
  toast.show();
  
  // Remove toast after it's hidden
  toastEl.addEventListener('hidden.bs.toast', function() {
    toastEl.remove();
  });
}

/**
 * Format a date string into a more readable format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
  if (!dateString) return '';
  const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Date(dateString).toLocaleDateString(undefined, options);
}

/**
 * Truncate text to specific length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} length - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, length = 100) {
  if (!text || text.length <= length) return text;
  return text.substring(0, length) + '...';
}
