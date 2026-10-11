import { Composition } from "remotion";
import { SaatIcinde } from "./SaatIcinde";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SaatIcinde"
      component={SaatIcinde}
      durationInFrames={990}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
