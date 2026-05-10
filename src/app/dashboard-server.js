import { createServer } from 'node:http';
import { createRepository } from '../db/repository.js';
import { buildDashboardView } from './dashboard-view.js';
import { renderDashboardHtml } from './dashboard-render.js';
const sendHtml = (response, html) => {
    response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
    });
    response.end(html);
};
const sendNotFound = (response) => {
    response.writeHead(404, {
        'content-type': 'text/plain; charset=utf-8',
    });
    response.end('Not found');
};
const toUrl = (request) => new URL(request.url ?? '/', 'http://127.0.0.1');
export const createDashboardServer = ({ repository }) => createServer((request, response) => {
    const url = toUrl(request);
    if (url.pathname !== '/') {
        sendNotFound(response);
        return;
    }
    const view = buildDashboardView({
        repository,
        selectedNoticeKey: url.searchParams.get('notice'),
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
