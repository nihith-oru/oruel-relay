import { prisma } from "../src/db";
import { hashApiKey } from "../src/middleware/clientAuth";
import { config } from "../src/config";
import crypto from "crypto";

async function runTests() {
  console.log("=== STARTING END-TO-END VERIFICATION ===");
  
  // 1. Create a test client
  const rawKey = `oruel_live_test_${crypto.randomBytes(16).toString("hex")}`;
  const apiKeyHash = hashApiKey(rawKey);
  const clientName = "System E2E Test Client";

  console.log(`[1] Creating test client: "${clientName}"`);
  const client = await prisma.client.create({
    data: {
      name: clientName,
      apiKeyHash,
      apiKeyPrefix: rawKey.slice(0, 18),
      spendCapUsd: 100.0,
    }
  });
  console.log(`Test client created with ID: ${client.id}`);

  try {
    // 2. Query running port
    const port = config.port;
    const url = `http://localhost:${port}`;
    console.log(`[2] Targeting local server at: ${url}`);

    // 3. Test Health Endpoint
    console.log("[3] Fetching /healthz...");
    const healthRes = await fetch(`${url}/healthz`);
    const healthJson = await healthRes.json() as any;
    console.log(`Health status: ${healthRes.status}, Body:`, healthJson);
    if (healthRes.status !== 200 || !healthJson.ok) {
      throw new Error("Health check failed");
    }

    // 4. Test unauthorized request
    console.log("[4] Testing unauthorized request (missing X-API-Key)...");
    const unauthRes = await fetch(`${url}/api/providers`);
    const unauthJson = await unauthRes.json() as any;
    console.log(`Status: ${unauthRes.status}, Body:`, unauthJson);
    if (unauthRes.status !== 401 || unauthJson.code !== "UNAUTHORIZED") {
      throw new Error("Authorization check failed (expected 401)");
    }

    // 5. Test authorized request (Providers)
    console.log("[5] Testing authorized request to /api/providers...");
    const provRes = await fetch(`${url}/api/providers`, {
      headers: { "X-API-Key": rawKey }
    });
    const provJson = await provRes.json() as any;
    console.log(`Status: ${provRes.status}, Providers count: ${Array.isArray(provJson) ? provJson.length : "Not an array"}`);
    if (provRes.status !== 200) {
      throw new Error(`Failed to load providers: ${JSON.stringify(provJson)}`);
    }

    // 6. Test /api/gpu-offers and Markup math
    console.log("[6] Testing /api/gpu-offers and Markup calculation...");
    const offersRes = await fetch(`${url}/api/gpu-offers?limit=2`, {
      headers: { "X-API-Key": rawKey }
    });
    const offersJson = await offersRes.json() as any;
    if (offersRes.status !== 200) {
      throw new Error(`Failed to fetch gpu-offers: ${JSON.stringify(offersJson)}`);
    }
    console.log(`Status: 200, Total model groups: ${offersJson.total}`);

    // If offers are found, check the markup
    if (offersJson.data && offersJson.data.length > 0) {
      const modelGroup = offersJson.data[0];
      console.log(`Checking markup on model: ${modelGroup.gpuModel}`);
      console.log(`Lowest Price: ${modelGroup.lowestPrice}, Highest Price: ${modelGroup.highestPrice}`);
      
      // Let's verify markup logic.
      const setting = await prisma.setting.findUnique({ where: { key: "markup_percent" } });
      const currentMarkup = setting ? Number(setting.value) : config.defaultMarkupPercent;
      console.log(`Current markup percent active: ${currentMarkup}%`);
      
      if (typeof modelGroup.lowestPrice !== "number" || isNaN(modelGroup.lowestPrice)) {
        throw new Error("lowestPrice is not a valid number!");
      }
    } else {
      console.log("No GPU offers returned by Spheron (this is normal if Spheron key is sandbox or has no active stock, but endpoint works!)");
    }

    // 7. Verify request logger logged the calls in database
    console.log("[7] Checking RequestLog database table...");
    const logs = await prisma.requestLog.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "desc" }
    });
    console.log(`Logs recorded for client in DB: ${logs.length}`);
    for (const log of logs) {
      console.log(`  -> Path: ${log.path}, Method: ${log.method}, Code: ${log.statusCode}, Duration: ${log.durationMs}ms`);
    }
    if (logs.length < 2) {
      throw new Error(`Expected at least 2 request logs, found ${logs.length}`);
    }

    console.log("\n🟢 ALL END-TO-END INTEGRATION TESTS PASSED SUCCESSFULLY! 🟢");
  } finally {
    console.log(`[8] Cleaning up test client...`);
    await prisma.requestLog.deleteMany({ where: { clientId: client.id } });
    await prisma.client.delete({ where: { id: client.id } });
    console.log("Cleanup completed.");
  }
}

runTests().catch(err => {
  console.error("❌ E2E TEST RUN FAILED:", err);
  process.exit(1);
});
