import { Composition } from "remotion";
import { KolIcinde } from "./KolIcinde";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="KolIcinde"
      component={KolIcinde}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
