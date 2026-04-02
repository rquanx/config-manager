export type SnapshotKind = "file" | "directory" | "symlink" | "missing";

export interface GroupItemMeta {
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMeta {
  name: string;
  paths: string[];
  createdAt: string;
  updatedAt: string;
  activeItem: string | null;
  items: GroupItemMeta[];
}

export interface SnapshotPathRecord {
  sourcePath: string;
  kind: SnapshotKind;
  payloadRelativePath?: string;
  linkTarget?: string;
  linkType?: "file" | "dir" | "junction";
}

export interface SnapshotManifest {
  groupName: string;
  itemName: string;
  createdAt: string;
  paths: SnapshotPathRecord[];
}

export interface PromptOption {
  label: string;
  value: string;
}
