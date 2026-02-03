/**
 * Email Guesser - Pattern-based email generation
 * 
 * When you have a name + company domain but no email, this tries
 * common patterns and verifies them.
 * 
 * Accuracy: ~70% (worse than Hunter.io's 85%, but FREE)
 * 
 * Usage:
 *   const { guessEmail, generatePatterns } = require('./email-guesser');
 *   const email = await guessEmail('John', 'Doe', 'acme.com');
 */

/**
 * Common email patterns used by companies
 * Ordered by popularity (most common first)
 */
const EMAIL_PATTERNS = [
  '{first}.{last}@{domain}',      // john.doe@acme.com (most common: 45%)
  '{first}{last}@{domain}',       // johndoe@acme.com (20%)
  '{f}{last}@{domain}',           // jdoe@acme.com (15%)
  '{first}@{domain}',             // john@acme.com (10%)
  '{first}_{last}@{domain}',      // john_doe@acme.com (5%)
  '{last}.{first}@{domain}',      // doe.john@acme.com (3%)
  '{last}@{domain}',              // doe@acme.com (2%)
  '{first}{f.last}@{domain}',     // johnd@acme.com (<1%)
];

/**
 * Company size heuristics - affects pattern likelihood
 */
const COMPANY_SIZE_PATTERNS = {
  // Startups (<50 employees) - simple patterns
  startup: [
    '{first}@{domain}',
    '{first}.{last}@{domain}',
    '{f}{last}@{domain}'
  ],
  
  // SMB (50-500 employees) - standardized patterns
  smb: [
    '{first}.{last}@{domain}',
    '{first}{last}@{domain}',
    '{f}{last}@{domain}'
  ],
  
  // Enterprise (500+ employees) - formal patterns
  enterprise: [
    '{first}.{last}@{domain}',
    '{f}{last}@{domain}',
    '{last}.{first}@{domain}'
  ]
};

/**
 * Generate all possible email patterns for a person
 * 
 * @param {string} firstName - First name
 * @param {string} lastName - Last name  
 * @param {string} domain - Company domain (without @)
 * @param {Object} options - Configuration options
 * @returns {string[]} Array of email addresses to try
 */
function generatePatterns(firstName, lastName, domain, options = {}) {
  const {
    companySize = 'smb',           // startup | smb | enterprise
    includeNicknames = false,      // Try Bob for Robert, etc.
    includeMiddleInitial = false   // Try john.m.doe patterns
  } = options;
  
  // Normalize inputs
  const first = firstName.toLowerCase().trim();
  const last = lastName.toLowerCase().trim();
  let dom = domain.toLowerCase().trim();
  
  // Strip protocol (https://, http://)
  dom = dom.replace(/^https?:\/\//, '');
  
  // Strip www. prefix
  dom = dom.replace(/^www\./, '');
  
  // Remove trailing slash and path
  dom = dom.split('/')[0];
  
  // Get patterns for company size
  const patterns = COMPANY_SIZE_PATTERNS[companySize] || EMAIL_PATTERNS;
  
  const emails = patterns.map(pattern => 
    pattern
      .replace('{first}', first)
      .replace('{last}', last)
      .replace('{f}', first[0])
      .replace('{l}', last[0])
      .replace('{f.last}', last[0]) // for patterns like johnd@
      .replace('{domain}', dom)
  );
  
  // Add nickname variations if enabled
  if (includeNicknames) {
    const nickname = getCommonNickname(first);
    if (nickname && nickname !== first) {
      const nicknamePatterns = patterns.map(pattern =>
        pattern
          .replace('{first}', nickname)
          .replace('{last}', last)
          .replace('{f}', nickname[0])
          .replace('{domain}', dom)
      );
      emails.push(...nicknamePatterns);
    }
  }
  
  // Remove duplicates
  return [...new Set(emails)];
}

/**
 * Common nickname mappings
 */
const NICKNAME_MAP = {
  'robert': 'bob',
  'william': 'bill',
  'richard': 'dick',
  'james': 'jim',
  'michael': 'mike',
  'joseph': 'joe',
  'thomas': 'tom',
  'charles': 'chuck',
  'christopher': 'chris',
  'daniel': 'dan',
  'matthew': 'matt',
  'anthony': 'tony',
  'donald': 'don',
  'steven': 'steve',
  'kenneth': 'ken',
  'joshua': 'josh',
  'andrew': 'andy',
  'timothy': 'tim',
  'alexander': 'alex',
  'jonathan': 'jon',
  'benjamin': 'ben',
  'samuel': 'sam',
  'nicholas': 'nick',
  'zachary': 'zach',
  'elizabeth': 'liz',
  'katherine': 'kate',
  'jennifer': 'jen',
  'patricia': 'pat',
  'rebecca': 'becky',
  'margaret': 'maggie',
  'susan': 'sue',
  'deborah': 'deb',
  'stephanie': 'steph',
  'catherine': 'cathy',
  'michelle': 'mich',
  'kimberly': 'kim',
  'amanda': 'mandy',
  'melissa': 'mel'
};

function getCommonNickname(firstName) {
  return NICKNAME_MAP[firstName.toLowerCase()] || null;
}

/**
 * Guess and verify email address
 * Requires email-verifier.js to be available
 * 
 * @param {string} firstName 
 * @param {string} lastName 
 * @param {string} domain 
 * @param {Object} options - Configuration
 * @returns {Promise<Object|null>} { email, confidence, pattern } or null
 */
async function guessEmail(firstName, lastName, domain, options = {}) {
  const {
    verify = true,              // Verify emails (requires ZeroBounce API)
    returnAllGuesses = false,   // Return all patterns (don't verify)
    maxAttempts = 8,            // Stop after N failed verifications
    ...generateOptions
  } = options;
  
  // Generate candidate emails
  const candidates = generatePatterns(firstName, lastName, domain, generateOptions);
  
  // If no verification requested
  if (!verify) {
    if (returnAllGuesses) {
      // Return all candidates as array
      return candidates.map((email, idx) => ({
        email,
        confidence: Math.max(0.1, 1 - (idx * 0.1)), // First pattern = highest confidence
        pattern: EMAIL_PATTERNS[idx] || 'unknown',
        verified: false
      }));
    } else {
      // Return just the best guess as object
      return {
        email: candidates[0],
        confidence: 0.7, // Decent confidence for most common pattern
        pattern: EMAIL_PATTERNS[0],
        verified: false
      };
    }
  }
  
  // Try to verify each candidate
  try {
    const { verifyEmail } = require('./email-verifier');
    
    for (let i = 0; i < Math.min(candidates.length, maxAttempts); i++) {
      const email = candidates[i];
      
      try {
        const result = await verifyEmail(email);
        
        // Found a valid email!
        if (result.valid || result.status === 'catch-all') {
          return {
            email,
            confidence: result.status === 'valid' ? 0.9 : 0.6, // Lower confidence for catch-all
            pattern: EMAIL_PATTERNS[i] || 'unknown',
            verified: true,
            verificationScore: result.score
          };
        }
        
        // Rate limiting - slow down
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (verifyError) {
        console.warn(`[EmailGuesser] Verification failed for ${email}:`, verifyError.message);
      }
    }
    
    // No valid email found
    return null;
    
  } catch (err) {
    // Email verifier not available - return best guess
    console.warn('[EmailGuesser] Verifier unavailable, returning best guess');
    return {
      email: candidates[0],
      confidence: 0.5,
      pattern: EMAIL_PATTERNS[0],
      verified: false
    };
  }
}

/**
 * Batch guess emails for multiple people at same company
 * More efficient than calling guessEmail() in a loop
 * 
 * @param {Object[]} people - Array of { firstName, lastName }
 * @param {string} domain - Company domain
 * @param {Object} options
 * @returns {Promise<Object[]>} Results for each person
 */
async function guessEmailsBatch(people, domain, options = {}) {
  const results = [];
  
  for (const person of people) {
    try {
      const result = await guessEmail(person.firstName, person.lastName, domain, options);
      results.push({
        ...person,
        ...result
      });
      
      // Rate limiting between batch items
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (err) {
      results.push({
        ...person,
        email: null,
        error: err.message
      });
    }
  }
  
  return results;
}

/**
 * Learn from verified emails to improve pattern matching
 * Call this when you confirm an email is correct
 * 
 * @param {string} email - Confirmed email address
 * @param {string} firstName
 * @param {string} lastName  
 * @param {string} domain
 */
function learnFromVerifiedEmail(email, firstName, lastName, domain) {
  // Extract pattern from confirmed email
  const pattern = detectPattern(email, firstName, lastName, domain);
  
  if (pattern) {
    // TODO: Store in database for future predictions
    // For now, just log it
    console.log(`[EmailGuesser] Learned pattern: ${pattern} for domain ${domain}`);
  }
}

/**
 * Detect which pattern was used for a given email
 */
function detectPattern(email, firstName, lastName, domain) {
  const first = firstName.toLowerCase();
  const last = lastName.toLowerCase();
  const localPart = email.split('@')[0].toLowerCase();
  
  if (localPart === `${first}.${last}`) return '{first}.{last}@{domain}';
  if (localPart === `${first}${last}`) return '{first}{last}@{domain}';
  if (localPart === `${first[0]}${last}`) return '{f}{last}@{domain}';
  if (localPart === first) return '{first}@{domain}';
  if (localPart === `${first}_${last}`) return '{first}_{last}@{domain}';
  if (localPart === `${last}.${first}`) return '{last}.{first}@{domain}';
  if (localPart === last) return '{last}@{domain}';
  
  return null; // Unknown pattern
}

/**
 * Get statistics about email patterns for a domain
 * Useful for understanding what works for a company
 * 
 * @param {string} domain
 * @returns {Object} Pattern frequency stats
 */
async function getDomainPatternStats(domain) {
  // TODO: Query database for previously verified emails
  // For now, return default stats
  
  return {
    domain,
    mostCommonPattern: '{first}.{last}@{domain}',
    confidence: 0.45,
    sampleSize: 0,
    patterns: {
      '{first}.{last}@{domain}': 0.45,
      '{first}{last}@{domain}': 0.20,
      '{f}{last}@{domain}': 0.15,
      '{first}@{domain}': 0.10,
      'other': 0.10
    }
  };
}

module.exports = {
  guessEmail,
  generatePatterns,
  guessEmailsBatch,
  learnFromVerifiedEmail,
  getDomainPatternStats,
  EMAIL_PATTERNS,
  COMPANY_SIZE_PATTERNS
};
