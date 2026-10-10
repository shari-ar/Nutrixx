export { getAdultDriBaselineReleaseV1 } from './baseline-targets.js';
export {
  ENERGY_RULE_SOURCE_V1,
  ENERGY_RULE_VERSION_V1,
  estimateEnergyRequirementV1,
  type EnergyRequirementResultV1,
} from './energy-requirement.js';
export {
  HEALTH_CONTEXT_RULE_VERSION_V1,
  assessHealthContextV1,
  type HealthContextInputV1,
  type HealthContextSnapshotV1,
} from './health-context.js';
export {
  NUTRIENT_CROSSWALK_V1,
  resolveNutrientConceptV1,
  type NutrientCrosswalkEntryV1,
} from './nutrient-crosswalk.js';
export {
  TargetPolicyReleaseV1Schema,
  TargetRuleV1Schema,
  selectTargetV1,
  type TargetPolicyReleaseV1,
  type TargetQueryV1,
  type TargetRuleV1,
  type TargetSelectionV1,
} from './target-policy.js';
