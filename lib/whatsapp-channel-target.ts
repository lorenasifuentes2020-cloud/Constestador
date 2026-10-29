import type { Workspace } from "./domain";

export function resolveWhatsAppStoreId(
  workspace: Workspace,
  requestedStoreId: string,
  existingChannelStoreId?: string | null,
): string | null {
  if (workspace.stores.some((store) => store.id === requestedStoreId)) {
    return requestedStoreId;
  }
  if (
    existingChannelStoreId &&
    workspace.stores.some((store) => store.id === existingChannelStoreId)
  ) {
    return existingChannelStoreId;
  }
  return null;
}
