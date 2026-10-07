import { AudioPlanSchema, ProductResearchSchema, SceneSpecSchema, StoryboardSchema } from '@videogen/shared';
import { zodValidator } from '@videogen/claude';

/** SpecStore validation for every session and step (write_spec included). M4b adds the scene contract. */
export const ARTIFACT_VALIDATOR = zodValidator({ research: ProductResearchSchema, storyboard: StoryboardSchema, scene: SceneSpecSchema, audio: AudioPlanSchema });
