import { Composition } from "remotion";
import anchorData from "./anchors.json";
import { EnigmaIcinde } from "./EnigmaIcinde";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="EnigmaIcinde"
      component={EnigmaIcinde}
      durationInFrames={anchorData.frames}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
