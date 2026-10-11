import { Composition } from "remotion";
import { KlavyeIcinde } from "./KlavyeIcinde";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="KlavyeIcinde"
      component={KlavyeIcinde}
      durationInFrames={840}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
