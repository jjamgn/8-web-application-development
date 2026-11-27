export type StagedVariant = { tempPath: string; width: number; height: number; mime: 'image/webp'; bytes: number };
export type PreparedPhoto = { title: string; alt: string; width: number; height: number; variants: StagedVariant[] };
export type Actor = { userId: string; purpose?: 'AVATAR' };
