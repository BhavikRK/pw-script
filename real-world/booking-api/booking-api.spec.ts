import { test, expect, APIRequestContext } from '@playwright/test';

/*
 * API-only check of Restful-booker, a public hotel booking API built for testing. No browser page is
 * opened: every call goes through Playwright's request context, and each one lands in the trace's
 * network resources.
 *
 * The admin account is the API's published one; override it with
 * --envVars BOOKER_USER=... BOOKER_PASSWORD=...
 */
const BOOKER_USER = process.env.BOOKER_USER ?? 'admin';
const BOOKER_PASSWORD = process.env.BOOKER_PASSWORD ?? 'password123';

test.use({
    baseURL: 'https://restful-booker.herokuapp.com',
    extraHTTPHeaders: { Accept: 'application/json' },
});

// The API is a shared instance on a free dyno: allow for a cold start, but not for a slow API.
const LATENCY_BUDGET_MS = Number(process.env.LATENCY_BUDGET_MS ?? 5000);

async function token(request: APIRequestContext) {
    const response = await request.post('/auth', { data: { username: BOOKER_USER, password: BOOKER_PASSWORD } });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.token, 'auth returned no token - are the credentials right?').toBeTruthy();
    return body.token as string;
}

function newBooking() {
    const checkin = new Date(Date.now() + 30 * 86400000);
    const checkout = new Date(checkin.getTime() + 3 * 86400000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    return {
        firstname: 'Asm',
        lastname: `Check${Date.now()}`,
        totalprice: 450,
        depositpaid: true,
        bookingdates: { checkin: day(checkin), checkout: day(checkout) },
        additionalneeds: 'Breakfast',
    };
}

test('the API is up', async ({ request }) => {
    const started = Date.now();
    const response = await request.get('/ping');
    expect(response.status()).toBe(201);
    expect.soft(Date.now() - started, `/ping took longer than ${LATENCY_BUDGET_MS}ms`).toBeLessThan(LATENCY_BUDGET_MS);
});

test('booking lifecycle: create, find, update, patch, cancel', async ({ request }) => {
    const auth = await test.step('get a token', () => token(request));
    const booking = newBooking();

    const id = await test.step('create', async () => {
        const response = await request.post('/booking', { data: booking });
        expect(response.ok()).toBeTruthy();
        const body = await response.json();
        expect(body.booking).toEqual(booking);
        return body.bookingid as number;
    });

    await test.step('read it back', async () => {
        const response = await request.get(`/booking/${id}`);
        expect(response.ok()).toBeTruthy();
        expect(await response.json()).toEqual(booking);
    });

    await test.step('find it by guest name', async () => {
        const response = await request.get('/booking', {
            params: { firstname: booking.firstname, lastname: booking.lastname },
        });
        expect(response.ok()).toBeTruthy();
        const ids = (await response.json()).map((b: { bookingid: number }) => b.bookingid);
        expect(ids).toContain(id);
    });

    const updated = { ...booking, totalprice: 600, additionalneeds: 'Late checkout' };
    await test.step('replace it (token in a cookie)', async () => {
        const response = await request.put(`/booking/${id}`, {
            data: updated,
            headers: { Cookie: `token=${auth}` },
        });
        expect(response.ok()).toBeTruthy();
        expect(await response.json()).toEqual(updated);
    });

    await test.step('patch one field (basic auth)', async () => {
        const basic = Buffer.from(`${BOOKER_USER}:${BOOKER_PASSWORD}`).toString('base64');
        const response = await request.patch(`/booking/${id}`, {
            data: { depositpaid: false },
            headers: { Authorization: `Basic ${basic}` },
        });
        expect(response.ok()).toBeTruthy();
        expect(await response.json()).toEqual({ ...updated, depositpaid: false });
    });

    await test.step('cancel it', async () => {
        const response = await request.delete(`/booking/${id}`, { headers: { Cookie: `token=${auth}` } });
        expect(response.status()).toBe(201);
        expect((await request.get(`/booking/${id}`)).status()).toBe(404);
    });
});

test.describe('authorization', () => {
    let id: number;

    test.beforeAll(async ({ request }) => {
        const response = await request.post('/booking', { data: newBooking() });
        id = (await response.json()).bookingid;
    });

    test.afterAll(async ({ request }) => {
        await request.delete(`/booking/${id}`, { headers: { Cookie: `token=${await token(request)}` } });
    });

    test('bad credentials get no token', async ({ request }) => {
        const response = await request.post('/auth', { data: { username: BOOKER_USER, password: 'wrong' } });
        // The API answers 200 and says so in the body rather than with a 401.
        expect(response.status()).toBe(200);
        expect(await response.json()).toEqual({ reason: 'Bad credentials' });
    });

    test('writes without a token are refused', async ({ request }) => {
        expect((await request.put(`/booking/${id}`, { data: newBooking() })).status()).toBe(403);
        expect((await request.patch(`/booking/${id}`, { data: { totalprice: 1 } })).status()).toBe(403);
        expect((await request.delete(`/booking/${id}`)).status()).toBe(403);
    });

    test('a forged token is refused', async ({ request }) => {
        const response = await request.delete(`/booking/${id}`, { headers: { Cookie: 'token=forged' } });
        expect(response.status()).toBe(403);
        expect((await request.get(`/booking/${id}`)).ok()).toBeTruthy();
    });
});
