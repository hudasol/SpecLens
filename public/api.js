export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request(method, url, body) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch {
    throw new ApiError('SpecLens could not be reached. Check that it is still running, then try again.', 'unreachable', 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.error?.message ?? `The request failed (${response.status}).`, data?.error?.code, response.status);
  }
  return data;
}

export const api = {
  state: () => request('GET', '/api/state'),
  propose: (text) => request('POST', '/api/interpretation/propose', { text }),
  editRequirement: (edit) => request('POST', '/api/requirement/edit', edit),
  approve: () => request('POST', '/api/requirement/approve'),
  confirmMapping: (criterionId) => request('POST', '/api/mapping/confirm', { criterionId }),
  runTest: (testId) => request('POST', `/api/tests/${encodeURIComponent(testId)}/run`),
  applyRepair: (repairId) => request('POST', '/api/repair/apply', { repairId }),
  reset: () => request('POST', '/api/reset'),
  probe: (amount) => request('POST', '/api/app/attempt', { amount }),
};
