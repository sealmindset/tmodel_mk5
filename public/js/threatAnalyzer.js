// Client-side threat analyzer interaction
document.addEventListener('DOMContentLoaded', function() {
  // Initialize event listeners for threat analysis
  const suggestionBtn = document.querySelector('button[onclick*="analyzeThreatModel"]');
  if (suggestionBtn) {
    // Override the inline onclick to use our function
    suggestionBtn.onclick = function() {
      const subjectId = this.getAttribute('onclick').match(/'([^']+)'/)[1];
      analyzeThreatModel(subjectId);
    };
  }
});

// Store suggestions for later use
let threatSuggestions = [];
let currentSubjectId = '';

// Show the loading modal
function showLoadingModal() {
  const loadingModal = new bootstrap.Modal(document.getElementById('loadingModal'));
  loadingModal.show();
}

// Hide the loading modal
function hideLoadingModal() {
  const loadingModalEl = document.getElementById('loadingModal');
  const loadingModal = bootstrap.Modal.getInstance(loadingModalEl);
  if (loadingModal) {
    loadingModal.hide();
  }
}

// Show an alert message
function showAlert(message, type = 'danger') {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show`;
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  document.querySelector('.container').prepend(alert);
  setTimeout(() => {
    alert.classList.remove('show');
    setTimeout(() => alert.remove(), 300);
  }, 5000);
}

// Create the threat suggestions modal if it doesn't exist
function ensureThreatSuggestionsModal() {
  if (!document.getElementById('threatSuggestionsModal')) {
    const modalHtml = `
      <div class="modal fade" id="threatSuggestionsModal" tabindex="-1" aria-labelledby="threatSuggestionsModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="threatSuggestionsModalLabel">AI Threat Suggestions</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="mb-4">
                <p>Based on analysis of your threat model and similar models in our database, we suggest considering the following additional threats:</p>
                <div class="alert alert-info" id="suggestionAnalysis">
                  <p><strong>Analysis:</strong> <span id="analysisText">Loading analysis...</span></p>
                </div>
              </div>
              
              <div class="mb-4">
                <h6>Suggested Threats:</h6>
                <div id="suggestedThreats" class="list-group">
                  <!-- Suggestions will be added here dynamically -->
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              <button type="button" class="btn btn-primary" onclick="applySelectedSuggestions()">
                <i class="bi bi-plus-circle me-1"></i>Add Selected Threats
              </button>
            </div>
          </div>
        </div>
      </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }
}

// Analyze the threat model and show suggestions
function analyzeThreatModel(subjectId) {
  // Save the current subject ID
  currentSubjectId = subjectId;
  
  // Ensure the modal exists
  ensureThreatSuggestionsModal();
  
  // Show loading
  showLoadingModal();
  
  // Reset suggestions
  threatSuggestions = [];
  
  // Call the API to analyze threats
  fetch(`/analyze-threats/${subjectId}`)
    .then(response => response.json())
    .then(data => {
      hideLoadingModal();
      
      if (data.success) {
        const analysis = data.analysis;
        
        // Display analysis in the modal
        let analysisText = `Found ${analysis.existingThreats} existing threats. `;
        
        if (analysis.missingCategories.length > 0) {
          analysisText += `Missing categories: ${analysis.missingCategories.join(', ')}. `;
        }
        
        if (analysis.components.length > 0) {
          analysisText += `Identified components: ${analysis.components.join(', ')}. `;
        }
        
        if (analysis.similarSubjects.length > 0) {
          analysisText += `Found ${analysis.similarSubjects.length} similar models for reference.`;
        }
        
        document.getElementById('analysisText').textContent = analysisText;
        
        // Display suggested threats
        displaySuggestedThreats(analysis.suggestions);
        
        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('threatSuggestionsModal'));
        modal.show();
      } else {
        showAlert('Error analyzing threat model: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(error => {
      hideLoadingModal();
      console.error('Error analyzing threat model:', error);
      showAlert('Error analyzing threat model. Please try again.');
    });
}

// Display suggested threats in the modal
function displaySuggestedThreats(suggestions) {
  const container = document.getElementById('suggestedThreats');
  container.innerHTML = '';
  
  if (!suggestions || suggestions.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No additional threats suggested.</div>';
    return;
  }
  
  // Store the suggestions for later use
  threatSuggestions = suggestions;
  
  suggestions.forEach((suggestion, index) => {
    const suggestionItem = document.createElement('div');
    suggestionItem.className = 'list-group-item';
    suggestionItem.innerHTML = `
      <div class="d-flex w-100 justify-content-between align-items-start mb-2">
        <div class="form-check">
          <input class="form-check-input suggestion-checkbox" type="checkbox" value="${index}" id="suggestion-${index}" checked>
          <label class="form-check-label fw-bold" for="suggestion-${index}">
            ${suggestion.threat}
          </label>
        </div>
      </div>
      <div class="mb-2 ps-4">
        <p class="mb-1"><strong>Description:</strong> ${suggestion.description}</p>
        <p class="mb-0"><strong>Mitigation:</strong> ${suggestion.mitigation}</p>
      </div>
    `;
    container.appendChild(suggestionItem);
  });
}

// Apply selected threat suggestions to the current threat model
function applySelectedSuggestions() {
  // Get selected suggestions
  const checkboxes = document.querySelectorAll('.suggestion-checkbox:checked');
  const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.value));
  
  if (selectedIndices.length === 0) {
    showAlert('Please select at least one suggestion to add.', 'warning');
    return;
  }
  
  const selectedSuggestions = selectedIndices.map(index => threatSuggestions[index]);
  
  // Show loading
  showLoadingModal();
  
  // Apply suggestions to the model
  fetch(`/apply-suggestions/${currentSubjectId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ suggestions: selectedSuggestions }),
  })
    .then(response => response.json())
    .then(data => {
      hideLoadingModal();
      
      if (data.success) {
        // Find and update the response textarea
        const responseTextarea = document.getElementById('editedResponse') || document.getElementById('response');
        if (responseTextarea) {
          responseTextarea.value = data.updatedResponse;
        }
        
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('threatSuggestionsModal'));
        modal.hide();
        
        // Show success message
        showAlert(`Successfully added ${selectedSuggestions.length} new threat(s)!`, 'success');
      } else {
        showAlert('Error applying suggestions: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(error => {
      hideLoadingModal();
      console.error('Error applying suggestions:', error);
      showAlert('Error applying suggestions. Please try again.');
    });
}
