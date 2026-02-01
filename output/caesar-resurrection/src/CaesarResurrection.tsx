import React from 'react';
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Sequence,
  spring,
  Audio,
  staticFile,
} from 'remotion';

const frames = [
  {
    src: staticFile('01-fallen-caesar.png'),
    duration: 90, // 3 seconds at 30fps
  },
  {
    src: staticFile('02-awakening.png'),
    duration: 90,
  },
  {
    src: staticFile('03-rising-power.png'),
    duration: 90,
  },
  {
    src: staticFile('04-supernatural-energy.png'),
    duration: 90,
  },
  {
    src: staticFile('05-standing-triumph.png'),
    duration: 90,
  },
  {
    src: staticFile('06-immortal-caesar.png'),
    duration: 120, // 4 seconds for final frame
  },
];

const transitionDuration = 30; // 1 second crossfade

interface SceneProps {
  src: string;
  index: number;
}

const Scene: React.FC<SceneProps> = ({src, index}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // Fade in
  const fadeIn = interpolate(
    frame,
    [0, transitionDuration],
    [0, 1],
    {extrapolateRight: 'clamp'}
  );

  // Scale animation (zoom in slightly for drama)
  const scale = interpolate(
    frame,
    [0, 90],
    [1, 1.1],
    {extrapolateRight: 'clamp'}
  );

  // Glow effect intensity
  const glowIntensity = spring({
    frame,
    fps,
    config: {
      damping: 20,
    },
  });

  return (
    <AbsoluteFill
      style={{
        opacity: fadeIn,
      }}
    >
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          filter: `brightness(${1 + glowIntensity * 0.2}) contrast(${1.1})`,
        }}
      >
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>

      {/* Blue energy overlay for awakening scenes */}
      {index >= 1 && index <= 4 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at 50% 50%, rgba(59, 130, 246, ${glowIntensity * 0.3}) 0%, transparent 70%)`,
            mixBlendMode: 'screen',
          }}
        />
      )}

      {/* Golden divine light overlay for final scenes */}
      {index >= 4 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at 50% 40%, rgba(251, 191, 36, ${glowIntensity * 0.2}) 0%, transparent 60%)`,
            mixBlendMode: 'screen',
          }}
        />
      )}

      {/* Vignette effect */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.6) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

export const CaesarResurrection: React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  const frame = useCurrentFrame();

  let currentFrame = 0;

  // Title animation
  const titleOpacity = interpolate(
    frame,
    [durationInFrames - 90, durationInFrames - 60],
    [0, 1],
    {extrapolateRight: 'clamp'}
  );

  const titleScale = spring({
    frame: frame - (durationInFrames - 90),
    fps: 30,
    config: {
      damping: 12,
    },
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      {frames.map((frameData, index) => {
        const startFrame = currentFrame;
        currentFrame += frameData.duration;

        return (
          <Sequence
            key={index}
            from={startFrame}
            durationInFrames={frameData.duration + transitionDuration}
          >
            <Scene src={frameData.src} index={index} />
          </Sequence>
        );
      })}

      {/* Title overlay at the end */}
      <Sequence from={durationInFrames - 90} durationInFrames={90}>
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
          }}
        >
          <div
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: 80,
              fontWeight: 'bold',
              color: '#fff',
              textShadow: '0 0 30px rgba(59, 130, 246, 1), 0 0 60px rgba(59, 130, 246, 0.5)',
              textAlign: 'center',
              opacity: titleOpacity,
              transform: `scale(${titleScale})`,
            }}
          >
            CAESAR'S LEGIONS
            <div
              style={{
                fontSize: 40,
                marginTop: 20,
                color: '#fbbf24',
                textShadow: '0 0 20px rgba(251, 191, 36, 1), 0 0 40px rgba(251, 191, 36, 0.5)',
              }}
            >
              Rising from Death
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
