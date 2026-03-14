export type ManifestLike = {
  name: string;
  version: string;
  manifest_version: number;
  permissions?: string[] | undefined;
  optional_permissions?: string[] | undefined;
  host_permissions?: string[] | undefined;
  content_scripts?: Array<{
    matches?: string[] | undefined;
    js?: string[] | undefined;
  }> | undefined;
  externally_connectable?: {
    matches?: string[] | undefined;
    ids?: string[] | undefined;
  } | undefined;
};
