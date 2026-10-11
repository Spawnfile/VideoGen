import { Composition } from "remotion";
import { KalemIcinde } from "./KalemIcinde";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="KalemIcinde"
      component={KalemIcinde}
      durationInFrames={720}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
