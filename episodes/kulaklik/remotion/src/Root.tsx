import { Composition } from "remotion";
import { KulaklikIcinde } from "./KulaklikIcinde";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="KulaklikIcinde"
      component={KulaklikIcinde}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
