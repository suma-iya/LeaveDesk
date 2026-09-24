/** 84 KB, 1.2 MB */
export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`
