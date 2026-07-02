import type { RawNoticeCandidate, SourceAdapter } from './base.js';

const APPLY_HOME_PROVIDER = '청약홈';
const APPLY_HOME_API_URL = 'https://apis.data.go.kr/1613000/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail';
const APPLY_HOME_DETAIL_BASE_URL = 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do';

type ApplyHomeFetch = typeof fetch;

type ApplyHomeRawNotice = Record<string, unknown>;

export type CreateApplyHomeAdapterOptions = {
  fetch?: ApplyHomeFetch;
  serviceKey?: string | null;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const firstString = (row: ApplyHomeRawNotice, keys: string[]): string | null => {
  for (const key of keys) {
    const value = asString(row[key]);
    if (value) {
      return value;
    }
  }

  return null;
};

const normalizeDate = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d{4})[-.]?(\d{2})[-.]?(\d{2})$/);
  if (!match) {
    return value;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
};

const normalizeRegion = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (/서울/.test(value)) {
    return '서울';
  }
  if (/경기/.test(value)) {
    return '경기';
  }

  return value;
};

const normalizeTitle = (name: string): string =>
  /공고|모집/.test(name) ? name : `${name} 입주자모집공고`;

const buildSourceId = (row: ApplyHomeRawNotice): string => {
  const houseManageNo = firstString(row, ['HOUSE_MANAGE_NO', 'houseManageNo', 'house_manage_no']) ?? 'unknown-house';
  const pblancNo = firstString(row, ['PBLANC_NO', 'pblancNo', 'pblanc_no']) ?? 'unknown-pblanc';
  return `apt-${houseManageNo}-${pblancNo}`;
};

const buildSourceUrl = (row: ApplyHomeRawNotice): string | undefined => {
  const explicitUrl = firstString(row, ['HMPG_ADRES', 'hmpgAdres', 'URL', 'url']);
  if (explicitUrl?.startsWith('http')) {
    return explicitUrl;
  }

  const houseManageNo = firstString(row, ['HOUSE_MANAGE_NO', 'houseManageNo', 'house_manage_no']);
  const pblancNo = firstString(row, ['PBLANC_NO', 'pblancNo', 'pblanc_no']);
  if (!houseManageNo || !pblancNo) {
    return explicitUrl ?? undefined;
  }

  const url = new URL(APPLY_HOME_DETAIL_BASE_URL);
  url.searchParams.set('houseManageNo', houseManageNo);
  url.searchParams.set('pblancNo', pblancNo);
  return url.toString();
};

const getItems = (payload: unknown): ApplyHomeRawNotice[] => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) {
    return root.data.filter((item): item is ApplyHomeRawNotice => typeof item === 'object' && item !== null);
  }

  const item = ((root.response as Record<string, unknown> | undefined)?.body as Record<string, unknown> | undefined)
    ?.items as Record<string, unknown> | undefined;
  const rawItems = item?.item;
  if (Array.isArray(rawItems)) {
    return rawItems.filter((entry): entry is ApplyHomeRawNotice => typeof entry === 'object' && entry !== null);
  }
  if (rawItems && typeof rawItems === 'object') {
    return [rawItems as ApplyHomeRawNotice];
  }

  return [];
};

const rowToNotice = (row: ApplyHomeRawNotice): RawNoticeCandidate | null => {
  const houseName = firstString(row, ['HOUSE_NM', 'houseNm', 'house_nm']);
  if (!houseName) {
    return null;
  }

  const postedAt = normalizeDate(firstString(row, ['RCRIT_PBLANC_DE', 'rcritPblancDe', 'rcrit_pblanc_de']));
  const applicationStartAt = normalizeDate(
    firstString(row, ['SPSPLY_RCEPT_BGNDE', 'GNRL_RCEPT_BGNDE', 'spsplyRceptBgnde', 'gnrlRceptBgnde']),
  );
  const applicationEndAt = normalizeDate(
    firstString(row, ['GNRL_RCEPT_ENDDE', 'SPSPLY_RCEPT_ENDDE', 'gnrlRceptEndde', 'spsplyRceptEndde']),
  );
  const region = normalizeRegion(firstString(row, ['SUBSCRPT_AREA_CODE_NM', 'subscrptAreaCodeNm', 'subscrpt_area_code_nm']));
  const housingType = firstString(row, ['HOUSE_SECD_NM', 'houseSecdNm', 'house_secd_nm']);
  const address = firstString(row, ['HSSPLY_ADRES', 'hssplyAdres', 'hssply_adres']);

  return {
    sourceId: buildSourceId(row),
    title: normalizeTitle(houseName),
    status: '모집공고',
    region,
    targetTags: ['분양'],
    postedAt,
    applicationStartAt,
    applicationEndAt,
    sourceUrl: buildSourceUrl(row),
    metadata: {
      provider: APPLY_HOME_PROVIDER,
      housingType,
      address,
      businessEntity: firstString(row, ['BSNS_MBY_NM', 'bsnsMbyNm', 'bsns_mby_nm']),
      phone: firstString(row, ['MDHS_TELNO', 'mdhsTelno', 'mdhs_telno']),
      raw: row,
    },
    listings: [],
  };
};

export const parseApplyHomeNoticeResponse = (body: string): RawNoticeCandidate[] => {
  const parsed = JSON.parse(body) as unknown;
  return getItems(parsed)
    .map(rowToNotice)
    .filter((notice): notice is RawNoticeCandidate => notice !== null);
};

const buildApiUrl = (serviceKey: string): string => {
  const url = new URL(APPLY_HOME_API_URL);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '30');
  url.searchParams.set('type', 'json');
  return url.toString();
};

export const createApplyHomeAdapter = (options: CreateApplyHomeAdapterOptions = {}): SourceAdapter => {
  const fetchImpl = options.fetch ?? fetch;
  const serviceKey = options.serviceKey ?? process.env.CHUNGYAK_HOME_SERVICE_KEY ?? null;

  return {
    source: 'applyhome',
    async fetchNotices() {
      if (!serviceKey) {
        return [];
      }

      const response = await fetchImpl(buildApiUrl(serviceKey));
      const body = await response.text();
      return parseApplyHomeNoticeResponse(body);
    },
  };
};
