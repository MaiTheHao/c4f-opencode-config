/** Convert any thrown value into a stable, user-readable message. */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
