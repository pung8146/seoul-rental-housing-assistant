import { createDatabase, type SqliteDatabase } from './client';
import type { Listing, Notice, QueryFilters, SourceRun } from '../types';

type NoticeRow = {
  source: string;
  source_id: string;
  title: string;
  stable_key: string;
  change_hash: string;
  status: string | null;
  region: string | null;
  target_tags: string;
  posted_at: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  source_url: string | null;
  metadata_json: string;
};

type ListingRow = {
  source: string;
  notice_source_id: string;
  title: string;
  stable_key: string;
  change_hash: string;
  supply_type: string | null;
  region: string | null;
  target_tags: string;
  deposit: number | null;
  monthly_rent: number | null;
  floor_area_m2: number | null;
  status: string | null;
  metadata_json: string;
};

type SourceRunRow = {
  source: string;
  started_at: string;
  finished_at: string;
  status: SourceRun['status'];
  message: string | null;
};

const serializeArray = (value: string[]) => JSON.stringify(value);
const serializeObject = (value: Record<string, unknown>) => JSON.stringify(value);
const parseArray = (value: string) => JSON.parse(value) as string[];
const parseObject = (value: string) => JSON.parse(value) as Record<string, unknown>;

const mapNoticeRow = (row: NoticeRow): Notice => ({
  source: row.source,
  sourceId: row.source_id,
  title: row.title,
  stableKey: row.stable_key,
  changeHash: row.change_hash,
  status: row.status,
  region: row.region,
  targetTags: parseArray(row.target_tags),
  postedAt: row.posted_at,
  applicationStartAt: row.application_start_at,
  applicationEndAt: row.application_end_at,
  sourceUrl: row.source_url,
  metadata: parseObject(row.metadata_json),
});

const mapListingRow = (row: ListingRow): Listing => ({
  source: row.source,
  noticeSourceId: row.notice_source_id,
  title: row.title,
  stableKey: row.stable_key,
  changeHash: row.change_hash,
  supplyType: row.supply_type,
  region: row.region,
  targetTags: parseArray(row.target_tags),
  deposit: row.deposit,
  monthlyRent: row.monthly_rent,
  floorAreaM2: row.floor_area_m2,
  status: row.status,
  metadata: parseObject(row.metadata_json),
});

export const createRepository = (filename: string, database = createDatabase(filename)) => {
  const upsertNoticeStatement = database.prepare(`
    INSERT INTO notices (
      source, source_id, title, stable_key, change_hash, status, region,
      target_tags, posted_at, application_start_at, application_end_at, source_url, metadata_json
    ) VALUES (
      @source, @source_id, @title, @stable_key, @change_hash, @status, @region,
      @target_tags, @posted_at, @application_start_at, @application_end_at, @source_url, @metadata_json
    )
    ON CONFLICT(source, source_id) DO UPDATE SET
      title = excluded.title,
      stable_key = excluded.stable_key,
      change_hash = excluded.change_hash,
      status = excluded.status,
      region = excluded.region,
      target_tags = excluded.target_tags,
      posted_at = excluded.posted_at,
      application_start_at = excluded.application_start_at,
      application_end_at = excluded.application_end_at,
      source_url = excluded.source_url,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const upsertListingStatement = database.prepare(`
    INSERT INTO listings (
      source, notice_source_id, title, stable_key, change_hash, supply_type, region,
      target_tags, deposit, monthly_rent, floor_area_m2, status, metadata_json
    ) VALUES (
      @source, @notice_source_id, @title, @stable_key, @change_hash, @supply_type, @region,
      @target_tags, @deposit, @monthly_rent, @floor_area_m2, @status, @metadata_json
    )
    ON CONFLICT(stable_key) DO UPDATE SET
      source = excluded.source,
      notice_source_id = excluded.notice_source_id,
      title = excluded.title,
      change_hash = excluded.change_hash,
      supply_type = excluded.supply_type,
      region = excluded.region,
      target_tags = excluded.target_tags,
      deposit = excluded.deposit,
      monthly_rent = excluded.monthly_rent,
      floor_area_m2 = excluded.floor_area_m2,
      status = excluded.status,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const repository = {
    db: database,
    upsertNotice(notice: Notice) {
      upsertNoticeStatement.run({
        source: notice.source,
        source_id: notice.sourceId,
        title: notice.title,
        stable_key: notice.stableKey,
        change_hash: notice.changeHash,
        status: notice.status,
        region: notice.region,
        target_tags: serializeArray(notice.targetTags),
        posted_at: notice.postedAt,
        application_start_at: notice.applicationStartAt,
        application_end_at: notice.applicationEndAt,
        source_url: notice.sourceUrl,
        metadata_json: serializeObject(notice.metadata),
      });
    },
    upsertListing(listing: Listing) {
      upsertListingStatement.run({
        source: listing.source,
        notice_source_id: listing.noticeSourceId,
        title: listing.title,
        stable_key: listing.stableKey,
        change_hash: listing.changeHash,
        supply_type: listing.supplyType,
        region: listing.region,
        target_tags: serializeArray(listing.targetTags),
        deposit: listing.deposit,
        monthly_rent: listing.monthlyRent,
        floor_area_m2: listing.floorAreaM2,
        status: listing.status,
        metadata_json: serializeObject(listing.metadata),
      });
    },
    findNoticeBySourceId(source: string, sourceId: string) {
      const row = database
        .prepare('SELECT * FROM notices WHERE source = ? AND source_id = ?')
        .get(source, sourceId) as NoticeRow | undefined;
      return row ? mapNoticeRow(row) : null;
    },
    findListingByStableKey(stableKey: string) {
      const row = database.prepare('SELECT * FROM listings WHERE stable_key = ?').get(stableKey) as
        | ListingRow
        | undefined;
      return row ? mapListingRow(row) : null;
    },
    insertListingSnapshot(listing: Listing) {
      database
        .prepare(
          'INSERT INTO listing_snapshots (listing_stable_key, change_hash, payload_json) VALUES (?, ?, ?)',
        )
        .run(listing.stableKey, listing.changeHash, JSON.stringify(listing));
    },
    recordNotification(channel: string, payloadHash: string, sentAt: string) {
      database
        .prepare(
          'INSERT OR IGNORE INTO notification_history (channel, payload_hash, sent_at) VALUES (?, ?, ?)',
        )
        .run(channel, payloadHash, sentAt);
    },
    hasNotification(channel: string, payloadHash: string) {
      const row = database
        .prepare('SELECT 1 FROM notification_history WHERE channel = ? AND payload_hash = ?')
        .get(channel, payloadHash) as { 1: number } | undefined;
      return Boolean(row);
    },
    recordSourceRun(run: SourceRun) {
      database
        .prepare(
          'INSERT INTO source_runs (source, started_at, finished_at, status, message) VALUES (?, ?, ?, ?, ?)',
        )
        .run(run.source, run.startedAt, run.finishedAt, run.status, run.message);
    },
    listSourceRuns() {
      return database
        .prepare('SELECT source, started_at, finished_at, status, message FROM source_runs ORDER BY id ASC')
        .all()
        .map((row) => ({
          source: (row as SourceRunRow).source,
          startedAt: (row as SourceRunRow).started_at,
          finishedAt: (row as SourceRunRow).finished_at,
          status: (row as SourceRunRow).status,
          message: (row as SourceRunRow).message,
        }));
    },
    queryNotices(filters: QueryFilters) {
      const clauses: string[] = [];
      const values: unknown[] = [];

      if (filters.source) {
        clauses.push('source = ?');
        values.push(filters.source);
      }
      if (filters.region) {
        clauses.push('region = ?');
        values.push(filters.region);
      }
      if (filters.status) {
        clauses.push('status = ?');
        values.push(filters.status);
      }
      if (filters.postedAfter) {
        clauses.push('posted_at >= ?');
        values.push(filters.postedAfter);
      }
      if (filters.postedBefore) {
        clauses.push('posted_at <= ?');
        values.push(filters.postedBefore);
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = database
        .prepare(`SELECT * FROM notices ${where} ORDER BY posted_at DESC, id DESC`)
        .all(...values) as NoticeRow[];

      return rows.map(mapNoticeRow).filter((notice) => {
        if (!filters.targetTags || filters.targetTags.length === 0) {
          return true;
        }
        return filters.targetTags.every((tag) => notice.targetTags.includes(tag));
      });
    },
    queryListingsByNotice(source: string, noticeSourceId: string) {
      const rows = database
        .prepare('SELECT * FROM listings WHERE source = ? AND notice_source_id = ? ORDER BY id ASC')
        .all(source, noticeSourceId) as ListingRow[];
      return rows.map(mapListingRow);
    },
    close() {
      database.close();
    },
  };

  return repository;
};

export type Repository = ReturnType<typeof createRepository>;
export type { SqliteDatabase };
