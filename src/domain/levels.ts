export interface Level {
  number: number;
  name: string;
  minimumSparks: number;
}

export const levels: readonly Level[] = [
  { number: 1, name: "Første Gnist", minimumSparks: 10 },
  { number: 2, name: "Medvind", minimumSparks: 100 },
  { number: 3, name: "Stifinner", minimumSparks: 300 },
  { number: 4, name: "Turkamerat", minimumSparks: 700 },
  { number: 5, name: "Bålvokter", minimumSparks: 1_500 },
  { number: 6, name: "Fjellgeit", minimumSparks: 3_000 },
  { number: 7, name: "Pustemester", minimumSparks: 6_000 },
] as const;

export interface LevelProgress {
  current: Level | null;
  next: Level | null;
  sparksUntilNext: number | null;
}

export function levelProgress(totalSparks: number): LevelProgress {
  const current = [...levels].reverse().find((level) => totalSparks >= level.minimumSparks) ?? null;
  const next = levels.find((level) => totalSparks < level.minimumSparks) ?? null;

  return {
    current,
    next,
    sparksUntilNext: next ? next.minimumSparks - totalSparks : null,
  };
}

