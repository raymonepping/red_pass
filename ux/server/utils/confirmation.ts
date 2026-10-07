export function assertInstanceConfirmation(confirm: unknown): void {
  if (confirm !== true) throw new Error('Explicit confirmation is required.')
}

/** Deleting an Ansible-provisioned VM directly needs an explicit ownership-drift acknowledgement. */
export function assertDeleteConfirmation(confirm: unknown, provisioned: boolean, acknowledgeDrift: unknown): void {
  assertInstanceConfirmation(confirm)
  if (provisioned && acknowledgeDrift !== true) throw new Error('Ansible ownership drift acknowledgement is required.')
}

export function assertPurgeConfirmation(phrase: unknown): void {
  if (phrase !== 'PURGE DELETED INSTANCES') throw new Error('The exact purge confirmation phrase is required.')
}
