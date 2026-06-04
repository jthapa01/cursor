// Base padding for root level items (after project header)
export const BASE_PADDING = 12;
// Indentation increment for each nested folder level
export const LEVEL_PADDING = 12;

export const getItemPadding = (level: number, isFile: boolean) => {
  // Files need extra padding since they do not have the chevron
  const fileOffset = isFile ? 16: 0;
  return BASE_PADDING + level * LEVEL_PADDING + fileOffset;
};
