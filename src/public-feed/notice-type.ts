import { detectNoticeTypes, type NoticeTypeLabel } from '../domain/notice-type.js';
import type { Notice } from '../types.js';

export type PublicNoticeTypeLabel = NoticeTypeLabel;

export const detectPublicNoticeTypes = (notice: Pick<Notice, 'title' | 'targetTags'>): PublicNoticeTypeLabel[] =>
  detectNoticeTypes(notice);
