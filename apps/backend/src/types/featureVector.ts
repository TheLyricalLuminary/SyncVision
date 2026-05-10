export interface FeatureVector {
  modelVersion:     string;
  tempo:            number;
  tonalCharacter:   string;
  energyCharacter:  string;
  valenceMean:      number;
  arousalMean:      number;
  tensionMean:      number;
  dominanceMean:    number;
  intimacyMean:     number;
  spectralCentroid: number;
  rmsEnergy:        number;
  zeroCrossingRate: number;
}

export function isFeatureVector(v: unknown): v is FeatureVector {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const nums: (keyof FeatureVector)[] = [
    "tempo", "valenceMean", "arousalMean", "tensionMean",
    "dominanceMean", "intimacyMean", "spectralCentroid",
    "rmsEnergy", "zeroCrossingRate",
  ];
  const strs: (keyof FeatureVector)[] = ["modelVersion", "tonalCharacter", "energyCharacter"];
  return (
    nums.every((k) => typeof o[k] === "number" && isFinite(o[k] as number)) &&
    strs.every((k) => typeof o[k] === "string" && (o[k] as string).length > 0)
  );
}
