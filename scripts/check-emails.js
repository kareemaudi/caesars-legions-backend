#!/usr/bin/env node
/**
 * Check for email replies from prospects
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');

const imap = new Imap({
  user: 'caesar@promptabusiness.com',
  password: '!7moyre#4etABw',
  host: 'imap.zoho.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

function openInbox(cb) {
  imap.openBox('INBOX', false, cb);
}

imap.once('ready', function() {
  openInbox(function(err, box) {
    if (err) {
      console.error('Error opening inbox:', err);
      process.exit(1);
    }

    // Search for unread emails in the last 7 days
    const searchCriteria = [
      ['SINCE', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]
    ];

    imap.search(searchCriteria, function(err, results) {
      if (err) {
        console.error('Search error:', err);
        imap.end();
        process.exit(1);
      }

      if (!results || results.length === 0) {
        console.log('\n✓ No recent emails found in the last 7 days');
        console.log('  (25 emails sent yesterday, responses typically take 24-48 hours)\n');
        imap.end();
        return;
      }

      console.log(`\nFound ${results.length} email(s) in the last 7 days:\n`);

      const fetch = imap.fetch(results, { bodies: '' });
      let count = 0;

      fetch.on('message', function(msg, seqno) {
        msg.on('body', function(stream, info) {
          simpleParser(stream, (err, parsed) => {
            if (err) {
              console.error('Parse error:', err);
              return;
            }

            count++;
            console.log(`--- Email ${count} ---`);
            console.log(`From: ${parsed.from.text}`);
            console.log(`Subject: ${parsed.subject}`);
            console.log(`Date: ${parsed.date}`);
            console.log(`Preview: ${(parsed.text || '').substring(0, 200)}...`);
            console.log('');
          });
        });
      });

      fetch.once('error', function(err) {
        console.error('Fetch error:', err);
      });

      fetch.once('end', function() {
        setTimeout(() => {
          imap.end();
        }, 1000);
      });
    });
  });
});

imap.once('error', function(err) {
  console.error('IMAP error:', err);
  process.exit(1);
});

imap.once('end', function() {
  process.exit(0);
});

imap.connect();
