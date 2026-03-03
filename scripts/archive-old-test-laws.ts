/**
 * Nightly archival script: Move test-namespace laws older than 7 days to namespace=archived
 *
 * Run with: npx tsx scripts/archive-old-test-laws.ts
 * Scheduled via OpenClaw cron at 3 AM daily.
 */

const API = "http://localhost:3001/api/v1";
const TOKEN = process.env.DISPATCHER_TOKEN ?? "st_wShsQaYUgKEL9uJosNtLlLx2bqQe0t5tVCN9DxYWIVA";
const MAX_AGE_DAYS = 7;

interface Law {
  id: string;
  lawCode: string;
  title: string;
  namespace: string;
  createdAt: string;
}

async function get(path: string): Promise<{ data: Law[]; meta?: { cursor?: string } }> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<{ data: Law[]; meta?: { cursor?: string } }>;
}

async function put(path: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
}

function isOlderThanDays(dateStr: string, days: number): boolean {
  const created = new Date(dateStr).getTime();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return created < cutoff;
}

async function main() {
  const cutoffDate = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  console.log(`Archiving test-namespace laws older than ${MAX_AGE_DAYS} days (before ${cutoffDate})...`);

  const testLaws: Law[] = [];
  let cursor: string | undefined;

  do {
    const url = `/laws?namespace=test&limit=100${cursor ? `&cursor=${cursor}` : ""}`;
    const result = await get(url);
    testLaws.push(...result.data);
    cursor = result.meta?.cursor ?? undefined;
  } while (cursor);

  console.log(`Found ${testLaws.length} test-namespace laws total.`);

  const toArchive = testLaws.filter((l) => isOlderThanDays(l.createdAt, MAX_AGE_DAYS));
  console.log(`Found ${toArchive.length} laws older than ${MAX_AGE_DAYS} days to archive:`);

  let archived = 0;
  for (const law of toArchive) {
    console.log(`  Archiving ${law.lawCode} | ${law.title} (created: ${law.createdAt})`);
    await put(`/laws/${law.id}`, { namespace: "archived" });
    archived++;
  }

  console.log(`\nDone. Archived ${archived} test laws.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
