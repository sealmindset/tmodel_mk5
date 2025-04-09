// threatAnalyzer.js - Utility for analyzing and suggesting threats
const natural = require('natural');
const { TfIdf } = natural;

// Threat categories based on common security frameworks
const THREAT_CATEGORIES = [
  'Authentication',
  'Authorization',
  'Input Validation',
  'Data Exposure',
  'Encryption',
  'Session Management',
  'Network Security',
  'Configuration',
  'API Security',
  'Dependency Security',
  'Logging/Monitoring',
  'Error Handling'
];

// Common system components that could be targeted
const SYSTEM_COMPONENTS = [
  'database', 'api', 'authentication', 'login', 'registration', 'user',
  'admin', 'file', 'upload', 'download', 'payment', 'transaction', 'server',
  'endpoint', 'frontend', 'backend', 'mobile', 'web', 'cloud', 'storage',
  'cache', 'session', 'cookie', 'token', 'password', 'email', 'sms', 'notification',
  'messaging', 'configuration', 'logging', 'monitoring', 'container', 'microservice',
  'gateway', 'router', 'network', 'encryption', 'ssl', 'tls', 'certificate'
];

class ThreatAnalyzer {
  constructor(redisClient) {
    this.client = redisClient;
  }
  
  /**
   * Analyze a threat model and suggest improvements
   * @param {string} subjectId - The subject ID
   * @param {string} subjectText - The subject description
   * @param {string} responseText - The current threat model response
   * @returns {Promise<Object>} - Analysis results and suggestions
   */
  async analyzeModel(subjectId, subjectText, responseText) {
    // Extract components and key terms from the subject
    const components = this.identifySystemComponents(subjectText);
    const keyTerms = this.extractKeyTerms(subjectText);
    
    // Extract existing threats from the response
    const existingThreats = this.extractThreatsFromResponse(responseText);
    
    // Find similar subjects for context
    const similarSubjects = await this.findSimilarSubjects(subjectId, subjectText);
    
    // Check which threat categories are covered in the existing threats
    const categorizedThreats = this.categorizeThreatModel(responseText);
    const coveredCategories = Object.keys(categorizedThreats);
    const missingCategories = THREAT_CATEGORIES.filter(category => 
      !coveredCategories.includes(category)
    );
    
    // Return the analysis results without generating suggestions
    // This simplified version only provides analysis, not suggestions
    return {
      components,
      keyTerms,
      existingThreats: existingThreats.length,
      coveredCategories,
      missingCategories,
      similarSubjects,
      suggestions: []
    };
  }

  /**
   * Extract key terms from a subject description
   * @param {string} subjectText - The subject description text
   * @returns {string[]} - Array of key terms
   */
  extractKeyTerms(subjectText) {
    const tfidf = new TfIdf();
    tfidf.addDocument(subjectText);
    
    // Extract top terms from the text
    const terms = [];
    tfidf.listTerms(0).slice(0, 10).forEach(item => {
      terms.push(item.term);
    });

    // Also extract any system component mentions
    SYSTEM_COMPONENTS.forEach(component => {
      if (subjectText.toLowerCase().includes(component.toLowerCase()) && !terms.includes(component)) {
        terms.push(component);
      }
    });
    
    return terms;
  }

  /**
   * Find similar subjects based on key terms
   * @param {string} currentSubjectId - The current subject ID
   * @param {string} subjectText - The subject description text
   * @returns {Promise<Array>} - Array of similar subject IDs and their similarity score
   */
  async findSimilarSubjects(currentSubjectId, subjectText) {
    try {
      const keyTerms = this.extractKeyTerms(subjectText);
      const subjects = await this.getAllSubjectsWithText();
      
      // Filter out the current subject
      const otherSubjects = subjects.filter(s => s.subjectid !== currentSubjectId);
      
      // Calculate similarity scores
      const similarSubjects = otherSubjects.map(subject => {
        const termMatches = keyTerms.filter(term => 
          subject.text.toLowerCase().includes(term.toLowerCase())
        ).length;
        
        const similarityScore = termMatches / keyTerms.length;
        
        return {
          subjectid: subject.subjectid,
          title: subject.title,
          similarityScore
        };
      });
      
      // Sort by similarity score (descending) and take top 5
      return similarSubjects
        .filter(s => s.similarityScore > 0.2) // Only include somewhat similar subjects
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 5);
    } catch (err) {
      console.error('Error finding similar subjects:', err);
      return [];
    }
  }

  /**
   * Get all subjects with their text
   * @returns {Promise<Array>} - Array of subject objects with IDs, titles, and text
   */
  async getAllSubjectsWithText() {
    try {
      const keys = await this.client.keys('subject:*:title');
      const subjects = keys.map(key => key.split(':')[1]);
      
      const results = [];
      
      for (const subjectid of subjects) {
        const title = await this.client.get(`subject:${subjectid}:title`);
        const text = await this.client.get(`subject:${subjectid}:subject`);
        
        if (title && text) {
          results.push({ subjectid, title, text });
        }
      }
      
      return results;
    } catch (err) {
      console.error('Error getting all subjects with text:', err);
      return [];
    }
  }

  /**
   * Categorize threats from a threat model response
   * @param {string} responseText - The full threat model response text
   * @returns {Object} - Categorized threats
   */
  categorizeThreatModel(responseText) {
    const threatPattern = /## Threat:([^#]+)##\s*\*\*Description:\*\*([^*]+)/g;
    const threats = {};
    
    let match;
    while ((match = threatPattern.exec(responseText)) !== null) {
      const threat = match[1].trim();
      const description = match[2].trim();
      const category = this.determineThreatCategory(threat, description);
      
      if (!threats[category]) {
        threats[category] = [];
      }
      
      threats[category].push({ threat, description });
    }
    
    return threats;
  }

  /**
   * Determine the category of a threat based on its content
   * @param {string} threat - The threat title
   * @param {string} description - The threat description
   * @returns {string} - The threat category
   */
  determineThreatCategory(threat, description) {
    const text = (threat + ' ' + description).toLowerCase();
    
    // Simple keyword matching for categories
    if (text.includes('auth') || text.includes('login') || text.includes('password')) {
      return 'Authentication';
    } else if (text.includes('permission') || text.includes('access control') || text.includes('privilege')) {
      return 'Authorization';
    } else if (text.includes('input') || text.includes('validation') || text.includes('sanitiz') || text.includes('injection')) {
      return 'Input Validation';
    } else if (text.includes('sensitive') || text.includes('leak') || text.includes('exposure') || text.includes('disclosure')) {
      return 'Data Exposure';
    } else if (text.includes('encrypt') || text.includes('decrypt') || text.includes('cipher')) {
      return 'Encryption';
    } else if (text.includes('session') || text.includes('cookie') || text.includes('token')) {
      return 'Session Management';
    } else if (text.includes('network') || text.includes('firewall') || text.includes('port')) {
      return 'Network Security';
    } else if (text.includes('config') || text.includes('setting') || text.includes('environment')) {
      return 'Configuration';
    } else if (text.includes('api') || text.includes('endpoint') || text.includes('interface')) {
      return 'API Security';
    } else if (text.includes('dependency') || text.includes('library') || text.includes('component') || text.includes('package')) {
      return 'Dependency Security';
    } else if (text.includes('log') || text.includes('monitor') || text.includes('alert')) {
      return 'Logging/Monitoring';
    } else if (text.includes('error') || text.includes('exception') || text.includes('failure')) {
      return 'Error Handling';
    } else {
      return 'Other';
    }
  }

  /**
   * Extract threats from a response
   * @param {string} responseText - The full threat model response
   * @returns {Array} - Array of threat objects
   */
  extractThreatsFromResponse(responseText) {
    const threatPattern = /## Threat:([^#]+)##\s*\*\*Description:\*\*([^*]+)\*\*Mitigation:\*\*([^#]*)/g;
    const threats = [];
    
    let match;
    while ((match = threatPattern.exec(responseText)) !== null) {
      threats.push({
        threat: match[1].trim(),
        description: match[2].trim(),
        mitigation: match[3].trim()
      });
    }
    
    return threats;
  }

  /**
   * Identify system components mentioned in the subject
   * @param {string} subjectText - The subject description
   * @returns {string[]} - Array of identified components
   */
  identifySystemComponents(subjectText) {
    const text = subjectText.toLowerCase();
    return SYSTEM_COMPONENTS.filter(component => 
      text.includes(component.toLowerCase())
    );
  }
}

module.exports = ThreatAnalyzer;
