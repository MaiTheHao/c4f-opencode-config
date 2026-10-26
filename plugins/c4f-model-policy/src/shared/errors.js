/** Extract a message from any thrown value. */
export function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
