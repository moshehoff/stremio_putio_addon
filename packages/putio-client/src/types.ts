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

export interface PutioSubtitleRecord {
  key: string;
  language: string;
  name: string;
  source: string;
}

export type PutioEventType =
  | 'upload'
  | 'zip_created'
  | 'transfer_completed'
  | 'file_shared'
  | 'transfer_from_rss_error'
  | 'transfer_error'
  | 'transfer_callback_error'
  | 'file_from_rss_deleted_for_space'
  | 'private_torrent_pin'
  | 'rss_filter_paused';

export interface PutioEvent {
  id: number;
  createdAt: string;
  type: PutioEventType;
}

export const PUTIO_LIBRARY_EVENT_TYPES: PutioEventType[] = [
  'upload',
  'transfer_completed',
  'file_shared',
  'file_from_rss_deleted_for_space',
];
