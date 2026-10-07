/** Spec §8.1, versioned (plan E2: a typed module instead of rubric.yaml). A calibration change bumps the version. */
export const RUBRIC_VERSION = 'final@1';

export type RubricOwner = 'orchestrator' | 'reviewer_visual' | 'reviewer_facts' | 'reviewer_retention' | 'rule';

export const GATE_IDS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;
export type GateId = (typeof GATE_IDS)[number];
/** Spec §8.2 ownership. G5 is split: the flash count is automatic (qc), "CG presented as real" is reviewer_visual's. */
export const GATES: Record<GateId, { label_tr: string; owner: RubricOwner }> = {
  G1: { label_tr: 'Teslim', owner: 'orchestrator' },
  G2: { label_tr: 'Doğruluk', owner: 'reviewer_facts' },
  G3: { label_tr: 'Haklar', owner: 'reviewer_visual' },
  G4: { label_tr: 'Beyan', owner: 'rule' },
  G5: { label_tr: 'Güvenlik', owner: 'reviewer_visual' },
  G6: { label_tr: 'Güvenli alan', owner: 'orchestrator' },
};

export const DIMENSION_IDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'] as const;
export type DimensionId = (typeof DIMENSION_IDS)[number];
export const DIMENSIONS: Record<DimensionId, { label_tr: string; weight: number; owner: RubricOwner }> = {
  D1: { label_tr: 'Kanca', weight: 15, owner: 'reviewer_retention' },
  D2: { label_tr: 'Görsel zanaat', weight: 15, owner: 'reviewer_visual' },
  D3: { label_tr: 'Hareket ve tempo', weight: 12, owner: 'reviewer_visual' },
  D4: { label_tr: 'Bilgi ve doğruluk', weight: 15, owner: 'reviewer_facts' },
  D5: { label_tr: 'Tipografi ve etiketler', weight: 10, owner: 'reviewer_visual' },
  D6: { label_tr: 'Ses', weight: 12, owner: 'orchestrator' },
  D7: { label_tr: 'Teknik cila', weight: 5, owner: 'orchestrator' },
  D8: { label_tr: 'Döngü ve izlenme', weight: 8, owner: 'reviewer_retention' },
  D9: { label_tr: 'Özgünlük', weight: 8, owner: 'reviewer_visual' },
};
