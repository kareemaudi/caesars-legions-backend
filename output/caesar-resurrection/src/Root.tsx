import {Composition} from 'remotion';
import {CaesarResurrection} from './CaesarResurrection';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CaesarResurrection"
        component={CaesarResurrection}
        durationInFrames={570} // 19 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
