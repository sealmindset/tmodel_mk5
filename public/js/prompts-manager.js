/**
 * Prompts Manager
 * Manages the CRUD operations for prompts in the Threat Model Generator
 */
document.addEventListener('DOMContentLoaded', function() {
  // Initialize the prompt modal events
  initPromptModalEvents();
  
  // Initialize view prompt button events on the results page
  initViewPromptButtonEvents();
});

/**
 * Initialize prompt modal events
 */
function initPromptModalEvents() {
  // Fetch prompts when the prompts modal is shown
  document.getElementById('promptsModal')?.addEventListener('show.bs.modal', function(event) {
    // Check if we have a prompt ID in the button that triggered the modal
    const button = event.relatedTarget;
    const promptId = button?.getAttribute('data-prompt-id');
    
    fetchPrompts();
    
    // If we have a prompt ID, view that prompt
    if (promptId) {
      // Wait a short time for prompts to load before viewing the specific prompt
      setTimeout(() => {
        viewPrompt(promptId, true); // true = view only (don't edit)
      }, 300);
    }
  });

  // Save new prompt button click handler
  document.getElementById('save-new-prompt-btn')?.addEventListener('click', saveNewPrompt);

  // Update prompt button click handler
  document.getElementById('update-prompt-btn')?.addEventListener('click', updatePrompt);

  // Delete prompt button click handler
  document.getElementById('delete-prompt-btn')?.addEventListener('click', initiatePromptDeletion);

  // Confirm action button click handler
  document.getElementById('confirm-action-btn')?.addEventListener('click', confirmAction);

  // Back to prompts button click handler
  document.getElementById('back-to-prompts-btn')?.addEventListener('click', function() {
    document.getElementById('prompts-list-section').classList.remove('d-none');
    document.getElementById('view-edit-prompt').classList.add('d-none');
  });
  
  // Import functionality temporarily disabled to fix workflow issues
}

/**
 * Send a JSON request to the server
 * @param {string} url - The URL to send the request to
 * @param {string} method - The HTTP method to use
 * @param {Object} data - The data to send with the request
 * @returns {Promise} A promise that resolves to the JSON response
 */
function sendJsonRequest(url, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'same-origin'
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    options.body = JSON.stringify(data);
  }

  return fetch(url, options).then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  });
}

/**
 * Fetch all prompts from the server
 */
function fetchPrompts() {
  sendJsonRequest('/api/prompts')
    .then(data => {
      if (!data.success) {
        showToast('Error', 'Failed to fetch prompts', 'danger');
        return;
      }
      
      const promptsList = document.getElementById('prompts-list');
      promptsList.innerHTML = '';
      
      if (data.prompts.length === 0) {
        promptsList.innerHTML = '<div class="col-12 text-center p-4"><p>No prompts found. Click "Add Prompt" to create one.</p></div>';
        return;
      }

      data.prompts.forEach(prompt => {
        const card = document.createElement('div');
        card.className = 'col-md-6 col-lg-4 mb-3';
        card.innerHTML = `
          <div class="card h-100">
            <div class="card-body">
              <h5 class="card-title text-truncate" title="${prompt.title}">${prompt.title}</h5>
              <div class="d-flex justify-content-between mt-3">
                <button class="btn btn-sm btn-outline-primary" onclick="selectPrompt('${prompt.id}', '${prompt.title.replace(/'/g, "\\'")}')">
                  <i class="bi bi-check-circle"></i> Select
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="viewPrompt('${prompt.id}')">
                  <i class="bi bi-pencil"></i> Edit
                </button>
              </div>
            </div>
          </div>`;
        promptsList.appendChild(card);
      });
    })
    .catch(error => {
      console.error('Error fetching prompts:', error);
      showToast('Error', 'Failed to fetch prompts', 'danger');
    });
}

/**
 * Select a prompt
 * @param {string} id - The prompt ID
 * @param {string} title - The prompt title
 */
function selectPrompt(id, title) {
  // Set the prompt ID and title in the form
  document.getElementById('promptId').value = id;
  document.getElementById('promptTitle').value = title;
  
  // Close the prompts modal
  const promptsModal = bootstrap.Modal.getInstance(document.getElementById('promptsModal'));
  if (promptsModal) {
    promptsModal.hide();
  }
  
  showToast('Success', `Selected prompt: ${title}`, 'success');
}

/**
 * View a prompt
 * @param {string} id - The prompt ID
 * @param {boolean} viewOnly - If true, don't allow editing the prompt
 */
/**
 * Reset the prompt modal to default state
 */
function resetPromptModal() {
  console.log('Resetting prompt modal');
  
  // Safely reset form values
  const promptIdElement = document.getElementById('prompt-id');
  const promptTitleElement = document.getElementById('prompt-title');
  const promptTextElement = document.getElementById('prompt-text');
  
  if (promptIdElement) promptIdElement.value = '';
  if (promptTitleElement) promptTitleElement.value = '';
  if (promptTextElement) promptTextElement.value = '';
  
  // Safely reset form readonly attributes
  if (promptTitleElement) promptTitleElement.readOnly = false;
  if (promptTextElement) promptTextElement.readOnly = false;
  
  // Safely show the prompts list section by default
  const promptsListSection = document.getElementById('prompts-list-section');
  const viewEditPrompt = document.getElementById('view-edit-prompt');
  
  if (promptsListSection) promptsListSection.classList.remove('d-none');
  if (viewEditPrompt) viewEditPrompt.classList.add('d-none');

  console.log('Prompt modal reset complete');
}

/**
 * View a prompt
 * @param {string} id - The prompt ID
 * @param {boolean} viewOnly - If true, don't allow editing the prompt
 */
function viewPrompt(id, viewOnly = false) {
  // Reset the modal
  resetPromptModal();
  
  // Show the view/edit section
  document.getElementById('view-edit-prompt').classList.remove('d-none');
  document.getElementById('prompts-list-section').classList.add('d-none');
  
  // Set the action buttons based on viewOnly
  if (viewOnly) {
    document.getElementById('update-prompt-btn').classList.add('d-none');
    document.getElementById('delete-prompt-btn').classList.add('d-none');
    document.getElementById('back-to-prompts-btn').classList.remove('d-none');
  } else {
    document.getElementById('update-prompt-btn').classList.remove('d-none');
    document.getElementById('delete-prompt-btn').classList.remove('d-none');
    document.getElementById('back-to-prompts-btn').classList.remove('d-none');
  }
  
  // Add debugging
  console.log(`Fetching prompt with ID: ${id}`);
  
  // Fetch the prompt data
  sendJsonRequest(`/api/prompts/${id}`)
    .then(data => {
      console.log('Prompt data received:', data);
      if (!data.success) {
        showToast('Error', 'Failed to fetch prompt', 'danger');
        return;
      }
      
      const prompt = data.prompt;
      
      // Set the form values
      document.getElementById('prompt-id').value = prompt.id;
      document.getElementById('prompt-title').value = prompt.title;
      document.getElementById('prompt-text').value = prompt.prompttext || prompt.text;
      
      // Set the readonly attribute based on viewOnly
      document.getElementById('prompt-title').readOnly = viewOnly;
      document.getElementById('prompt-text').readOnly = viewOnly;
    })
    .catch(error => {
      console.error('Error fetching prompt:', error);
      showToast('Error', 'Failed to fetch prompt', 'danger');
    });
}

/**
 * Save a new prompt
 */
function saveNewPrompt() {
  const title = document.getElementById('new-prompt-title').value.trim();
  const promptText = document.getElementById('new-prompt-text').value.trim();
  
  if (!title) {
    showToast('Error', 'Please enter a prompt title', 'warning');
    return;
  }
  
  if (!promptText) {
    showToast('Error', 'Please enter prompt text', 'warning');
    return;
  }
  
  sendJsonRequest('/api/prompts', 'POST', {
    title,
    text: promptText
  })
    .then(data => {
      if (!data.success) {
        showToast('Error', 'Failed to save prompt', 'danger');
        return;
      }
      
      // Reset form values
      document.getElementById('new-prompt-title').value = '';
      document.getElementById('new-prompt-text').value = '';
      
      // Show the prompts list section
      document.getElementById('prompts-list-section').classList.remove('d-none');
      document.getElementById('add-new-prompt').classList.add('d-none');
      
      // Refresh the prompts list
      fetchPrompts();
      
      showToast('Success', 'Prompt saved successfully', 'success');
    })
    .catch(error => {
      console.error('Error saving prompt:', error);
      showToast('Error', 'Failed to save prompt', 'danger');
    });
}

/**
 * Update a prompt
 */
function updatePrompt() {
  console.log('updatePrompt called');
  const id = document.getElementById('prompt-id').value;
  const title = document.getElementById('prompt-title').value.trim();
  const promptText = document.getElementById('prompt-text').value.trim();
  
  console.log('Prompt data to update:', { id, title, promptText });
  
  if (!id) {
    showToast('Error', 'Prompt ID is missing', 'danger');
    console.error('Missing prompt ID when trying to update');
    return;
  }
  
  if (!title) {
    showToast('Error', 'Please enter a prompt title', 'warning');
    return;
  }
  
  if (!promptText) {
    showToast('Error', 'Please enter prompt text', 'warning');
    return;
  }
  
  console.log(`Sending update request to /api/prompts/${id}`);
  
  sendJsonRequest(`/api/prompts/${id}`, 'PUT', {
    title,
    text: promptText
  })
    .then(data => {
      console.log('Update response:', data);
      if (!data.success) {
        showToast('Error', 'Failed to update prompt', 'danger');
        return;
      }
      
      // Show the prompts list section
      document.getElementById('prompts-list-section').classList.remove('d-none');
      document.getElementById('view-edit-prompt').classList.add('d-none');
      
      // Refresh the prompts list
      fetchPrompts();
      
      showToast('Success', 'Prompt updated successfully', 'success');
    })
    .catch(error => {
      console.error('Error updating prompt:', error);
      showToast('Error', 'Failed to update prompt', 'danger');
    });
}

/**
 * Initiate prompt deletion
 */
function initiatePromptDeletion() {
  const id = document.getElementById('prompt-id').value;
  const title = document.getElementById('prompt-title').value;
  
  confirmDeletion('prompt', id, title);
}

/**
 * Confirm deletion
 * @param {string} type - The type of item to delete
 * @param {string} id - The item ID
 * @param {string} name - The item name
 */
function confirmDeletion(type, id, name) {
  // Set the confirmation modal content
  const modalTitle = document.getElementById('confirmationModalLabel');
  const modalBody = document.getElementById('confirmationModalBody');
  const confirmButton = document.getElementById('confirm-action-btn');
  
  modalTitle.textContent = `Delete ${type}?`;
  modalBody.textContent = `Are you sure you want to delete "${name}"? This action cannot be undone.`;
  
  confirmButton.setAttribute('data-action', 'delete');
  confirmButton.setAttribute('data-type', type);
  confirmButton.setAttribute('data-id', id);
  
  // Hide the current modal
  const currentModal = bootstrap.Modal.getInstance(document.getElementById('promptsModal'));
  if (currentModal) {
    currentModal.hide();
  }
  
  // Show the confirmation modal
  const confirmationModal = new bootstrap.Modal(document.getElementById('confirmationModal'));
  confirmationModal.show();
}

/**
 * Confirm action
 */
function confirmAction() {
  const action = document.getElementById('confirm-action-btn').getAttribute('data-action');
  const type = document.getElementById('confirm-action-btn').getAttribute('data-type');
  const id = document.getElementById('confirm-action-btn').getAttribute('data-id');
  
  if (action === 'delete' && type === 'prompt') {
    deletePrompt(id);
  }
  
  // Close the confirmation modal
  const confirmationModal = bootstrap.Modal.getInstance(document.getElementById('confirmationModal'));
  if (confirmationModal) {
    confirmationModal.hide();
  }
}

/**
 * Delete a prompt
 * @param {string} id - The prompt ID
 */
function deletePrompt(id) {
  sendJsonRequest(`/api/prompts/${id}`, 'DELETE')
    .then(data => {
      if (!data.success) {
        showToast('Error', 'Failed to delete prompt', 'danger');
        return;
      }
      
      // Show success message and refresh the prompts list
      showToast('Success', 'Prompt deleted successfully', 'success');
      fetchPrompts();
      
      // Return to the prompts list section
      document.getElementById('prompts-list-section').classList.remove('d-none');
      document.getElementById('view-edit-prompt').classList.add('d-none');
    })
    .catch(error => {
      console.error('Error deleting prompt:', error);
      showToast('Error', 'Failed to delete prompt', 'danger');
    });
}

/**
 * Initialize view prompt button events on the results page
 */
function initViewPromptButtonEvents() {
  // Find any view-prompt-btn elements and add event listeners
  document.querySelectorAll('.view-prompt-btn').forEach(button => {
    button.addEventListener('click', function() {
      const promptId = this.getAttribute('data-prompt-id');
      if (promptId) {
        // The modal will be shown by the data-bs-toggle attribute
        // We just need to set the data-prompt-id attribute on the modal button
        const modalButton = document.querySelector('[data-bs-target="#promptsModal"]');
        if (modalButton) {
          modalButton.setAttribute('data-prompt-id', promptId);
        }
      }
    });
  });
}

/**
 * Show a toast message
 * @param {string} title - The toast title
 * @param {string} message - The toast message
 * @param {string} type - The toast type (success, warning, danger, info)
 */
/**
 * Import functionality removed to fix workflow issues
 * This function was previously used to handle importing prompts from a file
 */

/**
 * Import functionality removed to fix workflow issues
 * This function was previously used to import prompts from JSON data
 */

/**
 * Show a toast message
 * @param {string} title - The toast title
 * @param {string} message - The toast message
 * @param {string} type - The toast type (success, warning, danger, info)
 */
function showToast(title, message, type = 'info') {
  // Check if the toasts container exists
  let toastsContainer = document.getElementById('toasts-container');
  
  // If it doesn't exist, create it
  if (!toastsContainer) {
    toastsContainer = document.createElement('div');
    toastsContainer.id = 'toasts-container';
    toastsContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(toastsContainer);
  }
  
  // Create a unique ID for the toast
  const toastId = 'toast-' + Date.now();
  
  // Create the toast element
  const toastElement = document.createElement('div');
  toastElement.id = toastId;
  toastElement.className = `toast align-items-center text-white bg-${type} border-0`;
  toastElement.setAttribute('role', 'alert');
  toastElement.setAttribute('aria-live', 'assertive');
  toastElement.setAttribute('aria-atomic', 'true');
  
  // Add the toast content
  toastElement.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <strong>${title}:</strong> ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  
  // Add the toast to the container
  toastsContainer.appendChild(toastElement);
  
  // Initialize the toast
  const toast = new bootstrap.Toast(toastElement, {
    autohide: true,
    delay: 5000
  });
  
  // Show the toast
  toast.show();
  
  // Remove the toast element when it's hidden
  toastElement.addEventListener('hidden.bs.toast', function() {
    toastElement.remove();
  });
}
