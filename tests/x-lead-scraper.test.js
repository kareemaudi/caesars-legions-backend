const {
  scoreLead,
  extractLeadData,
  generateDMApproach,
  generateOutreachPlan
} = require('../lib/x-lead-scraper');

describe('X Lead Scraper', () => {
  
  describe('scoreLead', () => {
    
    it('should score high for founder with pain signals', () => {
      const tweet = {
        text: 'Our cold email campaigns are not working. Looking for better alternatives. Currently paying $15K/mo and frustrated.',
        created_at: new Date().toISOString(),
        likes: 15,
        retweets: 3,
        replies: 8
      };
      
      const profile = {
        bio: 'Founder & CEO at B2B SaaS startup. Building the future of sales automation.',
        followers: 8500,
        verified: true
      };
      
      const score = scoreLead(tweet, profile);
      expect(score).toBeGreaterThan(15); // Should be HIGH fit
    });
    
    it('should score low for irrelevant tweet', () => {
      const tweet = {
        text: 'Just had lunch at my favorite restaurant!',
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        likes: 2,
        retweets: 0,
        replies: 1
      };
      
      const profile = {
        bio: 'Food blogger. Love trying new restaurants.',
        followers: 500,
        verified: false
      };
      
      const score = scoreLead(tweet, profile);
      expect(score).toBeLessThan(5); // Should be LOW/filtered out
    });
    
    it('should give bonus points for high follower count', () => {
      const tweet = { text: 'Looking for cold email tool', created_at: new Date().toISOString() };
      
      const lowFollowers = scoreLead(tweet, { followers: 500 });
      const medFollowers = scoreLead(tweet, { followers: 3000 });
      const highFollowers = scoreLead(tweet, { followers: 15000 });
      
      expect(highFollowers).toBeGreaterThan(medFollowers);
      expect(medFollowers).toBeGreaterThan(lowFollowers);
    });
    
    it('should give bonus for recent tweets', () => {
      const profile = { followers: 1000 };
      
      const oldTweet = scoreLead(
        { text: 'cold email', created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
        profile
      );
      
      const recentTweet = scoreLead(
        { text: 'cold email', created_at: new Date().toISOString() },
        profile
      );
      
      expect(recentTweet).toBeGreaterThan(oldTweet);
    });
    
    it('should recognize multiple pain signals', () => {
      const tweet = {
        text: 'Frustrated with expensive cold email tools that are not working',
        created_at: new Date().toISOString()
      };
      
      const score = scoreLead(tweet, { followers: 1000 });
      expect(score).toBeGreaterThan(8); // Multiple pain signals = higher score
    });
    
  });
  
  describe('extractLeadData', () => {
    
    it('should extract all relevant fields', () => {
      const tweet = {
        username: 'saasfounder',
        name: 'Jane Doe',
        bio: 'Building B2B SaaS',
        followers: 5000,
        verified: true,
        text: 'Looking for better cold email solution',
        url: 'https://x.com/saasfounder/status/123',
        created_at: '2026-02-03T12:00:00Z',
        likes: 10,
        retweets: 3,
        replies: 5
      };
      
      const lead = extractLeadData(tweet, 15);
      
      expect(lead.username).toBe('saasfounder');
      expect(lead.name).toBe('Jane Doe');
      expect(lead.score).toBe(15);
      expect(lead.fit).toBe('HIGH');
      expect(lead.followers).toBe(5000);
      expect(lead.verified).toBe(true);
      expect(lead.scraped_at).toBeDefined();
    });
    
    it('should categorize fit correctly', () => {
      const tweet = { username: 'test', text: 'test' };
      
      const high = extractLeadData(tweet, 12);
      const medium = extractLeadData(tweet, 7);
      const low = extractLeadData(tweet, 4);
      
      expect(high.fit).toBe('HIGH');
      expect(medium.fit).toBe('MEDIUM');
      expect(low.fit).toBe('LOW');
    });
    
  });
  
  describe('generateDMApproach', () => {
    
    it('should suggest acknowledging pricing frustration', () => {
      const lead = {
        tweet_text: 'Cold email agencies are too expensive',
        followers: 3000
      };
      
      const approach = generateDMApproach(lead);
      expect(approach).toContain('pricing frustration');
    });
    
    it('should suggest empathy for poor results', () => {
      const lead = {
        tweet_text: 'Our cold email campaigns are not working',
        followers: 2000
      };
      
      const approach = generateDMApproach(lead);
      expect(approach).toContain('poor results');
    });
    
    it('should always include free test offer', () => {
      const lead = {
        tweet_text: 'Any cold email tool recommendations?',
        followers: 1000
      };
      
      const approach = generateDMApproach(lead);
      expect(approach).toContain('free test campaign');
    });
    
    it('should reference expertise for high-follower accounts', () => {
      const lead = {
        tweet_text: 'Looking for cold email solution',
        followers: 8000
      };
      
      const approach = generateDMApproach(lead);
      expect(approach).toContain('audience');
    });
    
  });
  
  describe('generateOutreachPlan', () => {
    
    it('should prioritize HIGH fit leads', () => {
      const leads = [
        { username: 'low1', score: 4, fit: 'LOW', tweet_text: 'test', name: 'Low' },
        { username: 'high1', score: 15, fit: 'HIGH', tweet_text: 'test', name: 'High' },
        { username: 'med1', score: 7, fit: 'MEDIUM', tweet_text: 'test', name: 'Med' }
      ];
      
      const plan = generateOutreachPlan(leads, 3);
      
      expect(plan.leads[0].fit).toBe('HIGH');
      expect(plan.leads[0].priority).toBe(1);
      expect(plan.total_leads).toBe(3);
      expect(plan.outreach_batch).toBe(3);
    });
    
    it('should limit to topN leads', () => {
      const leads = Array(20).fill(null).map((_, i) => ({
        username: `user${i}`,
        score: 10 - i,
        fit: 'MEDIUM',
        tweet_text: 'test',
        name: `User ${i}`
      }));
      
      const plan = generateOutreachPlan(leads, 5);
      
      expect(plan.outreach_batch).toBe(5);
      expect(plan.total_leads).toBe(20);
      expect(plan.leads.length).toBe(5);
    });
    
    it('should include context and DM approach for each lead', () => {
      const leads = [{
        username: 'founder',
        score: 12,
        fit: 'HIGH',
        tweet_text: 'Cold email is too expensive',
        name: 'Founder',
        followers: 5000
      }];
      
      const plan = generateOutreachPlan(leads, 1);
      
      expect(plan.leads[0].context).toBe('Cold email is too expensive');
      expect(plan.leads[0].dm_approach).toBeDefined();
      expect(plan.leads[0].dm_approach.length).toBeGreaterThan(0);
    });
    
  });
  
});
