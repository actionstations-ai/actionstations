// Ids for segments made in the editor (a split): SafeId-shaped and unique per transcript.
export const newClientId = (): string => crypto.randomUUID().replaceAll('-', '')
