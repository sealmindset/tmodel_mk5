// threatSuggestions.js - Client-side logic for automated threat suggestions

/**
 * Initialize the threat suggestions functionality
 * @param {string} subjectId - Current subject ID
 */
function initThreatSuggestions(subjectId) {
  // Store the current subject ID
  window.currentSubjectId = subjectId;
  window.threatSuggestions = [];
}

/**
 * Analyze the current threat model and suggest additional threats
 */
function analyzeThreatModel() {
  showLoadingModal();
  
  // Reset suggestions
  window.threatSuggestions = [];
  
  fetch(`/analyze-threats/${window.currentSubjectId}`)
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

/**
 * Display suggested threats in the modal
 * @param {Array} suggestions - Array of threat suggestions
 */
function displaySuggestedThreats(suggestions) {
  const container = document.getElementById('suggestedThreats');
  container.innerHTML = '';
  
  if (!suggestions || suggestions.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No additional threats suggested.</div>';
    return;
  }
  
  // Store the suggestions for later use
  window.threatSuggestions = suggestions;
  
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

/**
 * Apply selected threat suggestions to the current threat model
 */
function applySelectedSuggestions() {
  // Get selected suggestions
  const checkboxes = document.querySelectorAll('.suggestion-checkbox:checked');
  const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.value));
  
  if (selectedIndices.length === 0) {
    showAlert('Please select at least one suggestion to add.', 'warning');
    return;
  }
  
  const selectedSuggestions = selectedIndices.map(index => window.threatSuggestions[index]);
  
  // Show loading
  showLoadingModal();
  
  // Apply suggestions to the model
  fetch(`/apply-suggestions/${window.currentSubjectId}`, {
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
        // Update the response textarea with the new content
        document.getElementById('editedResponse').value = data.updatedResponse;
        
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
