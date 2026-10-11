import { Composition } from "remotion";
import { KilitIcinde } from "./KilitIcinde";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="KilitIcinde"
      component={KilitIcinde}
      durationInFrames={990}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
