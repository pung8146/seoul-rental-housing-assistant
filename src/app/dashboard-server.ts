import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { createRepository, type Repository } from '../db/repository.js';
import type { PersonalProfile } from '../types.js';
import { buildDashboardView, type DashboardNoticeTypeFilter } from './dashboard-view.js';
import { renderDashboardHtml } from './dashboard-render.js';

type CreateDashboardServerInput = {
  repository: Repository;
};

const sendHtml = (response: ServerResponse, html: string): void => {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
};

const sendNotFound = (response: ServerResponse): void => {
  response.writeHead(404, {
    'content-type': 'text/plain; charset=utf-8',
  });
  response.end('Not found');
};

const redirectTo = (response: ServerResponse, location: string): void => {
  response.writeHead(303, { location });
  response.end();
};

const toUrl = (request: IncomingMessage): URL =>
  new URL(request.url ?? '/', 'http://127.0.0.1');

const parseNoticeTypeFilter = (value: string | null): DashboardNoticeTypeFilter => {
  if (value === 'sale' || value === 'rent' || value === 'newlywed' || value === 'youth') {
    return value;
  }
  return 'all';
};

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
};

const parseNullableNumber = (value: string | null): number | null => {
  const normalized = value?.replace(/,/g, '').trim() ?? '';
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNullableInteger = (value: string | null): number | null => {
  const parsed = parseNullableNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
};

const parseNullableString = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

const parseInterestTags = (value: string | null): string[] =>
  (value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

const parseReturnTo = (value: string | null): string => {
  const trimmed = value?.trim() ?? '';
  return trimmed.startsWith('/') && !trimmed.startsWith('//') ? trimmed : '/';
};

const parseProfileForm = (body: string): { profile: PersonalProfile; returnTo: string } => {
  const params = new URLSearchParams(body);
  return {
    profile: {
      birthYear: parseNullableInteger(params.get('birthYear')),
      isHomeless: params.get('isHomeless') === 'true',
      residenceRegion: parseNullableString(params.get('residenceRegion')),
      householdSize: parseNullableInteger(params.get('householdSize')),
      monthlyIncome: parseNullableNumber(params.get('monthlyIncome')),
      totalAssets: parseNullableNumber(params.get('totalAssets')),
      vehicleValue: parseNullableNumber(params.get('vehicleValue')),
      subscriptionAccountMonths: parseNullableInteger(params.get('subscriptionAccountMonths')),
      subscriptionPaymentCount: parseNullableInteger(params.get('subscriptionPaymentCount')),
      interestTags: parseInterestTags(params.get('interestTags')),
    },
    returnTo: parseReturnTo(params.get('returnTo')),
  };
};

export const createDashboardServer = ({ repository }: CreateDashboardServerInput) =>
  createServer(async (request, response) => {
    const url = toUrl(request);

    if (request.method === 'POST' && url.pathname === '/profile') {
      const { profile, returnTo } = parseProfileForm(await readBody(request));
      repository.savePersonalProfile(profile);
      redirectTo(response, returnTo);
      return;
    }

    if (url.pathname !== '/') {
      sendNotFound(response);
      return;
    }

    const view = buildDashboardView({
      repository,
      selectedNoticeKey: url.searchParams.get('notice'),
      noticeTypeFilter: parseNoticeTypeFilter(url.searchParams.get('type')),
    });
    sendHtml(response, renderDashboardHtml(view));
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4173);
  const host = process.env.HOST ?? '127.0.0.1';
  const repository = createRepository(process.env.RENTAL_HOUSING_DB_PATH ?? 'rental-housing.db');
  const server = createDashboardServer({ repository });

  server.listen(port, host, () => {
    console.log(`Dashboard running at http://${host}:${port}`);
  });

  const close = () => {
    server.close(() => {
      repository.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
