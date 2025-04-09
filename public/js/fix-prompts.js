/**
 * Fix for Prompts Manager
 * This script adds additional event listeners to fix the viewing and editing of prompts
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('Loading prompts fix script...');
  
  // Add a direct event listener to the prompts modal to handle all click events
  document.getElementById('promptsModal')?.addEventListener('click', function(event) {
    const target = event.target;
    
    // Handle Edit button clicks
    if (target.matches('.btn-outline-secondary') || target.closest('.btn-outline-secondary')) {
      const button = target.matches('.btn-outline-secondary') ? target : target.closest('.btn-outline-secondary');
      const card = button.closest('.card');
      
      if (card) {
        // Find the prompt ID from the onclick attribute
        const onclickAttr = button.getAttribute('onclick') || '';
        const match = onclickAttr.match(/viewPrompt\('([^']+)'\)/);
        
        if (match && match[1]) {
          const promptId = match[1];
          console.log('Edit button clicked for prompt ID:', promptId);
          
          // Manually fetch and display the prompt
          fetch(`/prompts/${promptId}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'same-origin'
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
          })
          .then(data => {
            console.log('Prompt data received:', data);
            if (!data.success) {
              showToast('Error', 'Failed to fetch prompt', 'danger');
              return;
            }
            
            const prompt = data.prompt;
            
            // Show the view/edit section
            const viewEditSection = document.getElementById('view-edit-prompt');
            const promptsListSection = document.getElementById('prompts-list-section');
            
            if (viewEditSection && promptsListSection) {
              viewEditSection.classList.remove('d-none');
              promptsListSection.classList.add('d-none');
              
              // Set the form values
              const promptIdField = document.getElementById('prompt-id');
              const promptTitleField = document.getElementById('prompt-title');
              const promptTextField = document.getElementById('prompt-text');
              
              if (promptIdField) promptIdField.value = prompt.id;
              if (promptTitleField) promptTitleField.value = prompt.title;
              if (promptTextField) promptTextField.value = prompt.prompttext;
            }
          })
          .catch(error => {
            console.error('Error fetching prompt:', error);
            showToast('Error', 'Failed to fetch prompt', 'danger');
          });
          
          // Prevent the original viewPrompt from being called
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }
  });
  
  // Make sure the Update button correctly submits the form
  document.getElementById('update-prompt-btn')?.addEventListener('click', function() {
    const promptId = document.getElementById('prompt-id').value;
    const title = document.getElementById('prompt-title').value.trim();
    const promptText = document.getElementById('prompt-text').value.trim();
    
    console.log('Updating prompt with data:', { promptId, title, promptText });
    
    if (!promptId) {
      showToast('Error', 'Prompt ID is missing', 'danger');
      return;
    }
    
    if (!title || !promptText) {
      showToast('Error', 'Title and prompt text are required', 'danger');
      return;
    }
    
    // Send the update request
    fetch(`/prompts/${promptId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, prompttext: promptText }),
      credentials: 'same-origin'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Update response:', data);
      if (!data.success) {
        showToast('Error', 'Failed to update prompt', 'danger');
        return;
      }
      
      // Show success message
      showToast('Success', 'Prompt updated successfully', 'success');
      
      // Go back to the prompts list
      document.getElementById('prompts-list-section')?.classList.remove('d-none');
      document.getElementById('view-edit-prompt')?.classList.add('d-none');
      
      // Refresh the prompts list
      if (typeof fetchPrompts === 'function') {
        fetchPrompts();
      }
    })
    .catch(error => {
      console.error('Error updating prompt:', error);
      showToast('Error', 'Failed to update prompt', 'danger');
    });
  });
  
  // Make sure the Back button works
  document.getElementById('back-to-prompts-btn')?.addEventListener('click', function() {
    document.getElementById('prompts-list-section')?.classList.remove('d-none');
    document.getElementById('view-edit-prompt')?.classList.add('d-none');
  });
  
  // Fix the delete button functionality
  document.getElementById('delete-prompt-btn')?.addEventListener('click', function() {
    console.log('Delete button clicked');
    const id = document.getElementById('prompt-id').value;
    const title = document.getElementById('prompt-title').value;
    
    if (!id) {
      showToast('Error', 'Cannot delete: Prompt ID is missing', 'danger');
      return;
    }
    
    console.log('Deleting prompt:', id, title);
    
    // Set up the confirmation modal
    const confirmationModal = document.getElementById('confirmationModal');
    const modalTitle = confirmationModal.querySelector('.modal-title');
    const modalBody = confirmationModal.querySelector('.modal-body');
    const confirmButton = document.getElementById('confirm-action-btn');
    
    if (modalTitle) modalTitle.textContent = 'Delete Prompt?';
    if (modalBody) modalBody.innerHTML = `<p>Are you sure you want to delete "${title}"? This action cannot be undone.</p>`;
    
    // Set data attributes for the confirm button
    if (confirmButton) {
      confirmButton.setAttribute('data-action', 'delete');
      confirmButton.setAttribute('data-type', 'prompt');
      confirmButton.setAttribute('data-id', id);
      
      // Make sure we have our own click handler for the confirm button
      confirmButton.addEventListener('click', function() {
        const action = this.getAttribute('data-action');
        const type = this.getAttribute('data-type');
        const itemId = this.getAttribute('data-id');
        
        if (action === 'delete' && type === 'prompt') {
          // Send delete request to the server
          fetch(`/prompts/${itemId}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'same-origin'
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
          })
          .then(data => {
            console.log('Delete response:', data);
            if (!data.success) {
              showToast('Error', 'Failed to delete prompt', 'danger');
              return;
            }
            
            // Hide all modals
            const confirmModal = bootstrap.Modal.getInstance(confirmationModal);
            if (confirmModal) confirmModal.hide();
            
            const promptsModal = document.getElementById('promptsModal');
            const bsPromptsModal = bootstrap.Modal.getInstance(promptsModal);
            if (bsPromptsModal) bsPromptsModal.hide();
            
            // Show success message
            showToast('Success', 'Prompt deleted successfully', 'success');
            
            // Reopen prompts modal and refresh
            setTimeout(() => {
              const newPromptsModal = new bootstrap.Modal(promptsModal);
              newPromptsModal.show();
              
              // Refresh prompts list
              if (typeof fetchPrompts === 'function') {
                fetchPrompts();
              }
            }, 500);
          })
          .catch(error => {
            console.error('Error deleting prompt:', error);
            showToast('Error', 'Failed to delete prompt', 'danger');
          });
        }
      }, { once: true }); // Use once:true to avoid duplicate handlers
    }
    
    // Show the confirmation modal
    const bsConfirmationModal = new bootstrap.Modal(confirmationModal);
    bsConfirmationModal.show();
  });
  
  // Add handler for modal close to properly reset everything
  const promptsModal = document.getElementById('promptsModal');
  if (promptsModal) {
    promptsModal.addEventListener('hidden.bs.modal', function () {
      console.log('Prompts modal closed, resetting state...');
      
      // Reset all modal sections
      document.getElementById('prompts-list-section')?.classList.remove('d-none');
      document.getElementById('view-edit-prompt')?.classList.add('d-none');
      document.getElementById('add-prompt-section')?.classList.add('d-none');
      
      // Reset form fields
      const promptIdField = document.getElementById('prompt-id');
      const promptTitleField = document.getElementById('prompt-title');
      const promptTextField = document.getElementById('prompt-text');
      
      if (promptIdField) promptIdField.value = '';
      if (promptTitleField) {
        promptTitleField.value = '';
        promptTitleField.readOnly = false;
      }
      if (promptTextField) {
        promptTextField.value = '';
        promptTextField.readOnly = false;
      }
      
      // Reset buttons
      document.getElementById('update-prompt-btn')?.classList.add('d-none');
      document.getElementById('delete-prompt-btn')?.classList.add('d-none');
      document.getElementById('back-to-prompts-btn')?.classList.add('d-none');
      
      console.log('Modal state reset complete');
    });
  }
  
  console.log('Prompts fix script loaded successfully');
});
