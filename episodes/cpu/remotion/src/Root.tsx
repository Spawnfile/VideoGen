import { Composition } from "remotion";
import { CpuIcinde } from "./CpuIcinde";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CpuIcinde"
      component={CpuIcinde}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
