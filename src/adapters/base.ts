export type RawListingCandidate = {
  title: string;
  supplyType?: string;
  region?: string;
  targetTags?: string[] | string;
  deposit?: string | number;
  monthlyRent?: string | number;
  floorAreaM2?: string | number;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type RawNoticeCandidate = {
  sourceId: string;
  title: string;
  status?: string;
  region?: string;
  targetTags?: string[] | string;
  postedAt?: string;
  applicationStartAt?: string;
  applicationEndAt?: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
  listings: RawListingCandidate[];
};

export interface SourceAdapter {
  source: string;
  fetchNotices(): Promise<RawNoticeCandidate[]>;
  fetchNoticeDetails?(id: string): Promise<RawNoticeCandidate | null>;
}
