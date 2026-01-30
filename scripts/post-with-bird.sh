#!/bin/bash
# Post tweet using bird CLI (cookie-based, no API needed)

TWEET_FILE="../TWEET-TO-POST-NOW.txt"

if [ ! -f "$TWEET_FILE" ]; then
  echo "No tweet file found"
  exit 1
fi

TWEET_TEXT=$(cat "$TWEET_FILE")

echo "Posting with bird CLI:"
echo "$TWEET_TEXT"
echo "---"

bird post "$TWEET_TEXT"

if [ $? -eq 0 ]; then
  echo "✅ Tweet posted successfully"
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"method\":\"bird_cli\",\"status\":\"posted\"}" >> ../data/tweets-posted.jsonl
else
  echo "❌ Failed to post"
  exit 1
fi
