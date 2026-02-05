// ============================================================================
// EMAIL VERIFICATION MODULE - Caesar's Legions
// ============================================================================
// Purpose: Verify email addresses before sending campaigns
//          Prevents wasted sends, protects domain reputation, reduces bounces
// 
// Checks performed:
//   1. Format validation (RFC 5322 regex)
//   2. DNS MX record lookup (confirms domain accepts email)
//   3. Disposable domain detection (temp emails = low intent)
//   4. Role-based address detection (info@, support@ = low reply rate)
//   5. Common typo correction for known domains
//
// Integration: Drop-in before send-campaign-batch.js send loop
// ============================================================================

const dns = require('dns').promises;

// ============================================================================
// DISPOSABLE EMAIL DOMAINS — Common throwaway providers
// ============================================================================
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'guerrillamail.info', 'guerrillamail.biz', 'guerrillamail.de',
  'guerrillamail.net', 'guerrillamail.org', 'spam4.me', 'trashmail.com',
  'trashmail.me', 'trashmail.net', 'dispostable.com', 'mailnesia.com',
  'maildrop.cc', 'discard.email', 'spamgourmet.com', 'tempr.email',
  'fakeinbox.com', 'sharklasers.com', 'guerrillamailblock.com',
  'grr.la', 'guerrillamail.com', 'tempinbox.com', 'throwawaymail.com'
]);

// ============================================================================
// ROLE-BASED PREFIXES — These addresses rarely get human replies
// ============================================================================
const ROLE_BASED_PREFIXES = new Set([
  'info', 'support', 'sales', 'contact', 'help', 'admin', 'noreply',
  'no-reply', 'donotreply', 'do-not-reply', 'webmaster', 'postmaster',
  'mailer-daemon', 'abuse', 'security', 'billing', 'hr', 'recruiting',
  'careers', 'legal', 'compliance', 'newsletter', 'marketing',
  'press', 'media', 'public-relations', 'pr', 'general'
]);

// ============================================================================
// COMMON DOMAIN TYPOS — Auto-correct before verification
// ============================================================================
const DOMAIN_TYPO_MAP = {
  'gmail.co': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'yahoo.co': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'hotmail.co': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outook.com': 'outlook.com',
  'microsft.com': 'microsoft.com',
  'googel.com': 'google.com',
  'gogle.com': 'google.com',
  'amazn.com': 'amazon.com',
  'amazom.com': 'amazon.com'
};

// ============================================================================
// EMAIL VERIFIER CLASS
// ============================================================================
class EmailVerifier {
  /**
   * @param {Object} options
   * @param {number} options.dnsTimeout - DNS lookup timeout in ms (default: 5000)
   * @param {boolean} options.checkMX - Whether to perform MX lookup (default: true)
   * @param {boolean} options.checkDisposable - Whether to check disposable domains (default: true)
   * @param {boolean} options.checkRoleBased - Whether to flag role-based addresses (default: true)
   * @param {boolean} options.autoCorrectTypos - Whether to auto-correct domain typos (default: true)
   */
  constructor(options = {}) {
    this.dnsTimeout = options.dnsTimeout || 5000;
    this.checkMX = options.checkMX !== false;
    this.checkDisposable = options.checkDisposable !== false;
    this.checkRoleBased = options.checkRoleBased !== false;
    this.autoCorrectTypos = options.autoCorrectTypos !== false;
    
    // MX record cache — avoid repeated DNS lookups for same domain
    this._mxCache = new Map();
    this._cacheExpiry = options.cacheExpiry || 300000; // 5 min default
  }

  // ============================================================================
  // MAIN ENTRY POINT
  // ============================================================================

  /**
   * Verify a single email address
   * @param {string} email - Email address to verify
   * @returns {Object} Verification result
   */
  async verify(email) {
    const result = {
      original: email,
      email: email,
      valid: false,
      confidence: 0, // 0-100
      flags: [],      // Array of flag objects
      corrected: false,
      checks: {}
    };

    if (!email || typeof email !== 'string') {
      result.flags.push({ type: 'INVALID_INPUT', severity: 'error', message: 'Email is empty or not a string' });
      return result;
    }

    // 1. Normalize
    email = email.trim().toLowerCase();
    result.email = email;

    // 2. Auto-correct typos before other checks
    if (this.autoCorrectTypos) {
      const corrected = this._correctTypos(email);
      if (corrected !== email) {
        result.email = corrected;
        result.corrected = true;
        result.flags.push({ type: 'TYPO_CORRECTED', severity: 'info', message: `Corrected ${email} → ${corrected}` });
        email = corrected;
      }
    }

    // 3. Format check
    const formatCheck = this._validateFormat(email);
    result.checks.format = formatCheck;
    if (!formatCheck.valid) {
      result.flags.push({ type: 'INVALID_FORMAT', severity: 'error', message: formatCheck.message });
      return result;
    }

    const [localPart, domain] = email.split('@');

    // 4. Disposable domain check
    if (this.checkDisposable) {
      const disposableCheck = this._checkDisposable(domain);
      result.checks.disposable = disposableCheck;
      if (disposableCheck.isDisposable) {
        result.flags.push({ type: 'DISPOSABLE', severity: 'warning', message: `${domain} is a disposable email provider` });
      }
    }

    // 5. Role-based check
    if (this.checkRoleBased) {
      const roleCheck = this._checkRoleBased(localPart);
      result.checks.roleBased = roleCheck;
      if (roleCheck.isRoleBased) {
        result.flags.push({ type: 'ROLE_BASED', severity: 'warning', message: `"${localPart}" is a role-based address — low reply probability` });
      }
    }

    // 6. MX record check (async — actual DNS call)
    if (this.checkMX) {
      const mxCheck = await this._checkMXRecord(domain);
      result.checks.mx = mxCheck;
      if (!mxCheck.hasMX) {
        result.flags.push({ type: 'NO_MX_RECORD', severity: 'error', message: `No MX records found for ${domain}` });
      }
    }

    // 7. Calculate confidence score
    result.confidence = this._calculateConfidence(result);
    result.valid = result.confidence >= 60; // 60+ = sendable

    return result;
  }

  /**
   * Verify a batch of email addresses
   * @param {Array<Object>} prospects - Array of prospect objects with .email field
   * @param {Object} options - Batch options
   * @param {boolean} options.filterInvalid - If true, return only valid results (default: false)
   * @returns {Object} Batch results with summary
   */
  async verifyBatch(prospects, options = {}) {
    const results = [];
    
    for (const prospect of prospects) {
      const result = await this.verify(prospect.email);
      results.push({
        prospect,
        verification: result
      });
    }

    const valid = results.filter(r => r.verification.valid);
    const invalid = results.filter(r => !r.verification.valid);

    const summary = {
      total: results.length,
      valid: valid.length,
      invalid: invalid.length,
      validRate: results.length > 0 
        ? ((valid.length / results.length) * 100).toFixed(1) + '%' 
        : '0%',
      flagged: results.filter(r => r.verification.flags.length > 0).length,
      corrected: results.filter(r => r.verification.corrected).length
    };

    return {
      summary,
      results: options.filterInvalid ? valid : results,
      invalid // Always include invalid list for review
    };
  }

  // ============================================================================
  // INDIVIDUAL CHECKS
  // ============================================================================

  /**
   * Validate email format using RFC 5322 regex
   * @param {string} email
   * @returns {Object} { valid, message }
   */
  _validateFormat(email) {
    // RFC 5322 compliant regex (simplified)
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    
    if (!email.includes('@')) {
      return { valid: false, message: 'Missing @ symbol' };
    }

    const parts = email.split('@');
    if (parts.length !== 2) {
      return { valid: false, message: 'Multiple @ symbols' };
    }

    const [local, domain] = parts;
    if (!local || local.length === 0) {
      return { valid: false, message: 'Empty local part' };
    }
    if (!domain || domain.length === 0) {
      return { valid: false, message: 'Empty domain' };
    }
    if (local.length > 64) {
      return { valid: false, message: 'Local part exceeds 64 characters' };
    }
    if (domain.length > 253) {
      return { valid: false, message: 'Domain exceeds 253 characters' };
    }
    if (!emailRegex.test(email)) {
      return { valid: false, message: 'Invalid email format' };
    }

    return { valid: true, message: 'Format valid' };
  }

  /**
   * Check if domain is a known disposable email provider
   * @param {string} domain
   * @returns {Object} { isDisposable }
   */
  _checkDisposable(domain) {
    return {
      isDisposable: DISPOSABLE_DOMAINS.has(domain.toLowerCase())
    };
  }

  /**
   * Check if local part is a role-based address
   * @param {string} localPart
   * @returns {Object} { isRoleBased }
   */
  _checkRoleBased(localPart) {
    // Strip common separators and check
    const normalized = localPart.toLowerCase().replace(/[._-]/g, '');
    const isRoleBased = ROLE_BASED_PREFIXES.has(localPart.toLowerCase()) ||
                        ROLE_BASED_PREFIXES.has(normalized);
    return { isRoleBased };
  }

  /**
   * Perform DNS MX record lookup with caching
   * @param {string} domain
   * @returns {Object} { hasMX, records, cached }
   */
  async _checkMXRecord(domain) {
    // Check cache first
    const cached = this._mxCache.get(domain);
    if (cached && (Date.now() - cached.timestamp) < this._cacheExpiry) {
      return { ...cached.result, cached: true };
    }

    try {
      // Set timeout via AbortController pattern using Promise.race
      const mxRecords = await Promise.race([
        dns.resolveMx(domain),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('DNS_TIMEOUT')), this.dnsTimeout)
        )
      ]);

      const result = {
        hasMX: mxRecords && mxRecords.length > 0,
        records: mxRecords || [],
        cached: false
      };

      // Cache the result
      this._mxCache.set(domain, { result, timestamp: Date.now() });
      return result;
    } catch (error) {
      // DNS failed — could be timeout or NXDOMAIN
      // If domain doesn't exist, MX will fail. Flag as unresolvable.
      const result = {
        hasMX: false,
        records: [],
        cached: false,
        error: error.message === 'DNS_TIMEOUT' ? 'DNS lookup timed out' : error.message
      };

      // Cache failures too (short duration)
      this._mxCache.set(domain, { result, timestamp: Date.now() });
      return result;
    }
  }

  /**
   * Correct common domain typos
   * @param {string} email
   * @returns {string} Corrected email (or original if no correction needed)
   */
  _correctTypos(email) {
    const [local, domain] = email.split('@');
    if (!domain) return email;

    const corrected = DOMAIN_TYPO_MAP[domain.toLowerCase()];
    if (corrected) {
      return `${local}@${corrected}`;
    }
    return email;
  }

  /**
   * Calculate confidence score (0-100) based on check results
   * @param {Object} result - Verification result object
   * @returns {number} Confidence score
   */
  _calculateConfidence(result) {
    let score = 100;

    // Format invalid = 0 (hard fail)
    if (result.checks.format && !result.checks.format.valid) return 0;

    // No MX record = hard fail
    if (result.checks.mx && !result.checks.mx.hasMX) return 0;

    // Disposable domain = -45 (throwaway = never a real business contact)
    if (result.checks.disposable && result.checks.disposable.isDisposable) score -= 45;

    // Role-based = -20 (still sendable, just lower priority)
    if (result.checks.roleBased && result.checks.roleBased.isRoleBased) score -= 20;

    // MX lookup error (timeout) = -30
    if (result.checks.mx && result.checks.mx.error) score -= 30;

    // Typo correction adds uncertainty = -10
    if (result.corrected) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Clear the MX record cache
   */
  clearCache() {
    this._mxCache.clear();
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick single-email verification
 * @param {string} email
 * @returns {Object} Verification result
 */
async function verifyEmail(email) {
  const verifier = new EmailVerifier();
  return verifier.verify(email);
}

/**
 * Quick batch verification for a prospects file
 * @param {Array<Object>} prospects - Array with .email field
 * @returns {Object} Batch results with summary
 */
async function verifyProspects(prospects) {
  const verifier = new EmailVerifier();
  return verifier.verifyBatch(prospects);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  EmailVerifier,
  verifyEmail,
  verifyProspects,
  DISPOSABLE_DOMAINS,
  ROLE_BASED_PREFIXES,
  DOMAIN_TYPO_MAP
};
