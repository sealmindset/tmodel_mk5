/**
 * Framework Blocker
 * This script intercepts and disables the component framework that's
 * creating unwanted elements with data-component-name attributes.
 */

(function() {
  // Store references to original methods we'll override
  const originalCreateElement = document.createElement;
  const originalAppendChild = Node.prototype.appendChild;
  const originalInsertBefore = Node.prototype.insertBefore;
  const originalReplaceChild = Node.prototype.replaceChild;
  
  // Override createElement to monitor new elements
  document.createElement = function(tagName, options) {
    const element = originalCreateElement.call(document, tagName, options);
    
    // Add a property that we can check later
    element._frameworkBlocked = true;
    
    return element;
  };
  
  // Override appendChild to block components
  Node.prototype.appendChild = function(node) {
    // If it has the data-component-name attribute, don't add it
    if (node.nodeType === 1 && 
        node.getAttribute && 
        node.getAttribute('data-component-name') && 
        !['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(node.tagName)) {
      console.log('Blocked appendChild:', node.tagName, node.getAttribute('data-component-name'));
      return node; // Return the node but don't append it
    }
    
    return originalAppendChild.call(this, node);
  };
  
  // Override insertBefore to block components
  Node.prototype.insertBefore = function(node, referenceNode) {
    // If it has the data-component-name attribute, don't insert it
    if (node.nodeType === 1 && 
        node.getAttribute && 
        node.getAttribute('data-component-name') && 
        !['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(node.tagName)) {
      console.log('Blocked insertBefore:', node.tagName, node.getAttribute('data-component-name'));
      return node; // Return the node but don't insert it
    }
    
    return originalInsertBefore.call(this, node, referenceNode);
  };
  
  // Override replaceChild to block components
  Node.prototype.replaceChild = function(newNode, oldNode) {
    // If it has the data-component-name attribute, don't replace
    if (newNode.nodeType === 1 && 
        newNode.getAttribute && 
        newNode.getAttribute('data-component-name') && 
        !['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(newNode.tagName)) {
      console.log('Blocked replaceChild:', newNode.tagName, newNode.getAttribute('data-component-name'));
      return oldNode; // Return the old node and don't replace it
    }
    
    return originalReplaceChild.call(this, newNode, oldNode);
  };
  
  // Run a cleanup immediately after loading
  document.addEventListener('DOMContentLoaded', function() {
    // Remove any existing unwanted components
    const unwanted = document.querySelectorAll('[data-component-name]:not(input):not(button):not(select):not(textarea)');
    unwanted.forEach(el => {
      if (el.parentNode) {
        console.log('Removing existing component:', el.tagName, el.getAttribute('data-component-name'));
        el.parentNode.removeChild(el);
      }
    });
    
    console.log('Framework Blocker initialized - intercepting unwanted components');
  });
  
  // Also look for any framework initialization and try to disable it
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = function(callback, delay) {
    // If the framework uses setTimeout to initialize, we'll disable that
    if (delay === 0 || delay < 50) {
      const callbackString = callback.toString();
      // Check if this might be a framework initialization
      if (callbackString.includes('component') || 
          callbackString.includes('render') ||
          callbackString.includes('createElement')) {
        console.log('Potentially blocked framework initialization');
        return null; // Don't actually schedule the timeout
      }
    }
    
    return originalSetTimeout.call(window, callback, delay);
  };
  
  console.log('Framework Blocker installed');
})();
