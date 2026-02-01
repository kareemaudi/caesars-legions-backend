#!/usr/bin/env node
/**
 * Generate "Caesar's Resurrection" video frames
 * Julius Caesar rising from death, pulling daggers from his body
 */

require('dotenv').config();
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const outputDir = path.join(__dirname, '../output/caesar-resurrection');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Key frames for the resurrection sequence
const frames = [
  {
    filename: '01-dead-caesar.png',
    prompt: `Cinematic dramatic scene: Julius Caesar lying on marble floor, multiple ornate Roman daggers embedded in his torso and chest, wearing torn white toga stained with blood, dramatic lighting from above, Renaissance painting style, highly detailed, 8K quality, dark atmospheric lighting, marble columns in background`
  },
  {
    filename: '02-eyes-opening.png',
    prompt: `Cinematic dramatic scene: Close-up of Julius Caesar's face, eyes slowly opening with supernatural blue glow, daggers still in his body, dramatic lighting, intense expression, Renaissance painting style meets modern VFX, highly detailed, 8K quality, ethereal atmosphere`
  },
  {
    filename: '03-hand-reaching.png',
    prompt: `Cinematic dramatic scene: Julius Caesar's hand reaching up to grasp the first ornate Roman dagger embedded in his chest, supernatural blue energy emanating from his body, torn white toga, dramatic lighting, Renaissance painting style, highly detailed, 8K quality, mystical atmosphere`
  },
  {
    filename: '04-pulling-dagger.png',
    prompt: `Cinematic dramatic scene: Julius Caesar gripping ornate Roman dagger, pulling it from his chest, blue supernatural energy and light bursting from the wound, powerful stance, torn toga, dramatic lighting, Renaissance painting style meets Marvel VFX, highly detailed, 8K quality, epic moment`
  },
  {
    filename: '05-standing-power.png',
    prompt: `Cinematic dramatic scene: Julius Caesar standing tall and powerful, multiple daggers floating in air around him surrounded by blue supernatural energy, healed wounds glowing with light, restored white toga, commanding presence, dramatic backlighting, Renaissance painting style meets superhero aesthetic, highly detailed, 8K quality, triumphant pose`
  },
  {
    filename: '06-resurrection-complete.png',
    prompt: `Cinematic dramatic scene: Fully resurrected Julius Caesar standing in triumphant pose, golden laurel crown, pristine white toga, blue energy aura surrounding him, all daggers dissolved into light particles, marble Roman architecture background, dramatic cinematic lighting, Renaissance painting style meets modern epic fantasy, highly detailed, 8K quality, god-like presence`
  }
];

async function generateFrame(frame, index) {
  console.log(`\n🎨 Generating frame ${index + 1}/${frames.length}: ${frame.filename}`);
  console.log(`   Prompt: ${frame.prompt.substring(0, 80)}...`);
  
  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: frame.prompt,
      n: 1,
      size: '1792x1024', // Landscape for video
      quality: 'hd'
    });
    
    const imageUrl = response.data[0].url;
    console.log(`   ✅ Generated! Downloading...`);
    
    // Download image
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const outputPath = path.join(outputDir, frame.filename);
    fs.writeFileSync(outputPath, imageResponse.data);
    
    console.log(`   💾 Saved to: ${outputPath}`);
    
    return {
      filename: frame.filename,
      path: outputPath,
      url: imageUrl
    };
  } catch (error) {
    console.error(`   ❌ Failed:`, error.message);
    return null;
  }
}

async function generateAllFrames() {
  console.log('🏛️ CAESAR\'S RESURRECTION - Image Generation\n');
  console.log('='.repeat(60));
  console.log(`\nGenerating ${frames.length} key frames for video...\n`);
  
  const results = [];
  
  for (let i = 0; i < frames.length; i++) {
    const result = await generateFrame(frames[i], i);
    if (result) {
      results.push(result);
    }
    
    // Rate limit: OpenAI allows ~50 images/min for DALL-E 3
    // Wait 10 seconds between frames to be safe
    if (i < frames.length - 1) {
      console.log(`\n   ⏳ Waiting 10 seconds before next frame...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Generation complete!`);
  console.log(`\n📊 Results:`);
  console.log(`   Generated: ${results.length}/${frames.length} frames`);
  console.log(`   Output: ${outputDir}`);
  
  // Save metadata
  const metadata = {
    title: "Caesar's Resurrection",
    description: "Julius Caesar rising from death, pulling daggers from his body",
    frames: results,
    generated_at: new Date().toISOString(),
    total_frames: results.length
  };
  
  fs.writeFileSync(
    path.join(outputDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  
  console.log(`\n📝 Metadata saved to: ${path.join(outputDir, 'metadata.json')}`);
  
  console.log(`\n🎬 Next steps:`);
  console.log(`   1. Open folder: ${outputDir}`);
  console.log(`   2. Use video editing tool (CapCut, DaVinci, etc.) to sequence frames`);
  console.log(`   3. Add transitions, music, sound effects`);
  console.log(`   4. Export as MP4`);
  console.log(`\n   Or: Use Remotion to automate (see remotion-video-toolkit skill)`);
  
  return results;
}

generateAllFrames().catch(console.error);
