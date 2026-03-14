const TOKEN_TIMEOUT_MS = 5000;

async function getIdToken() {
  return Promise.race([
    window.shopify.idToken(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('idToken timeout')), TOKEN_TIMEOUT_MS)
    ),
  ]);
}

export async function apiFetch(path, options = {}) {
  let token;
  try {
    token = await getIdToken();
  } catch (err) {
    throw new Error('Could not get session token: ' + err.message);
  }
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
