import { Composition } from "remotion";
import { DURATION, RubikIcinde } from "./RubikIcinde";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="RubikIcinde"
      component={RubikIcinde}
      durationInFrames={DURATION}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
