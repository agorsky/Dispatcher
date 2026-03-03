/**
 * One-time migration script: Tag known junk/test-artifact laws as namespace=test
 *
 * Run with: npx tsx scripts/tag-test-laws.ts
 *
 * These are laws created by test harnesses or integration tests that polluted
 * the production law registry. They match known junk title patterns.
 */

const API = "http://localhost:3001/api/v1";
const TOKEN = process.env.DISPATCHER_TOKEN ?? "st_wShsQaYUgKEL9uJosNtLlLx2bqQe0t5tVCN9DxYWIVA";

const JUNK_PATTERNS = [
  /^FT (Law Updated|Edge Law|Dismiss Law)\s/i,
  /^Updated Law \d{13}$/i,
];

interface Law {
  id: string;
  lawCode: string;
  title: string;
  namespace: string;
}

async function get(path: string): Promise<{ data: Law[] }> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<{ data: Law[] }>;
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

function isJunk(law: Law): boolean {
  return JUNK_PATTERNS.some((p) => p.test(law.title));
}

async function main() {
  console.log("Fetching all laws...");
  const allLaws: Law[] = [];
  let cursor: string | undefined;

  do {
    const url = `/laws?limit=100${cursor ? `&cursor=${cursor}` : ""}`;
    const result = await get(url);
    allLaws.push(...result.data);
    cursor = (result as { data: Law[]; meta?: { cursor?: string } }).meta?.cursor ?? undefined;
  } while (cursor);

  console.log(`Found ${allLaws.length} total laws.`);

  const junkLaws = allLaws.filter((l) => isJunk(l) && l.namespace !== "test");
  console.log(`Found ${junkLaws.length} junk laws to tag as namespace=test:`);

  let tagged = 0;
  for (const law of junkLaws) {
    console.log(`  Tagging ${law.lawCode} | ${law.title}`);
    await put(`/laws/${law.id}`, { namespace: "test" });
    tagged++;
  }

  console.log(`\nDone. Tagged ${tagged} laws as namespace=test.`);

  if (tagged === 0) {
    console.log("No laws needed tagging (already clean or no matches found).");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
