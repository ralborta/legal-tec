import "dotenv/config";
import { ingestBatch } from "./ingest.js";
import fs from "node:fs/promises";

(async () => {
  const art765 = await fs.readFile("api/seed/ccyc_art_765.txt", "utf8").catch(()=> "Art. 765… (agregá el texto real aquí)");
  await ingestBatch(
    process.env.DATABASE_URL!,
    process.env.OPENAI_API_KEY!,
    [
      { text: art765, source: "normativa", title: "Art. 765 CCyC", url: "https://boletin.oficial/..." }
    ]
  );
  console.log("Seed OK");
})();

