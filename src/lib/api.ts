import { PUBLIC_API_URL, PUBLIC_MOCK_MODE } from '$env/static/public';
import { auth } from '$lib/stores/auth.svelte';
import { mockFetch } from '$lib/mock/handler';

const BASE_URL = `${PUBLIC_API_URL}/api`;
// Backend en memoria con datos de ejemplo, para recorrer la app sin depender del Express
// actual ni de una base de datos. Ver src/lib/mock/handler.ts y README.md.
const USE_MOCK = PUBLIC_MOCK_MODE === 'true';

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const headers = new Headers(options.headers);
	if (options.body) headers.set('Content-Type', 'application/json');
	if (auth.token) headers.set('Authorization', `Bearer ${auth.token}`);

	const res = USE_MOCK
		? await mockFetch(path, { ...options, headers })
		: await fetch(`${BASE_URL}${path}`, { ...options, headers });

	if (res.status === 401) {
		auth.logout();
	}

	if (!res.ok) {
		const body = await res.json().catch(() => ({}) as Record<string, string>);
		throw new ApiError(res.status, body.message ?? body.error ?? `Error ${res.status}`);
	}

	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

export const api = {
	get: <T>(path: string) => request<T>(path),
	post: <T>(path: string, data?: unknown) =>
		request<T>(path, {
			method: 'POST',
			body: data !== undefined ? JSON.stringify(data) : undefined
		}),
	put: <T>(path: string, data?: unknown) =>
		request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
	delete: <T>(path: string) => request<T>(path, { method: 'DELETE' })
};
