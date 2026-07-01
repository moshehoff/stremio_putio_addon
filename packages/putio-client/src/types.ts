export interface PutioAccountInfo {
  userId: number;
  username: string;
  email: string;
}

export interface PutioFileRecord {
  id: number;
  name: string;
  size: number;
  parentId: number;
  fileType: string;
  contentType: string;
  createdAt: string;
  crc32?: string;
}

export interface PaginatedFiles {
  files: PutioFileRecord[];
  cursor: string | null;
  total: number | null;
}

export interface ListAllFilesOptions {
  perPage?: number;
  fileTypes?: string[];
}
