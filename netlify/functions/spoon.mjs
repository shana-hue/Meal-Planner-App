// Go-between for Spoonacular. Runs on Netlify, so the API key never reaches the browser.
const BASE = "https://api.spoonacular.com";

export default async (req) => {
  const key = process.env.SPOONACULAR_KEY;
  if (!key) return reply(500, { error: "SPOONACULAR_KEY is not set in Netlify environment variables." });

  const q = Object.fromEntries(new URL(req.url).searchParams);
  let path, params = {};

  if (q.op === "extract") {
    path = "/recipes/extract";
    params = { url: q.url, includeNutrition: "true", analyze: "true", forceExtraction: "false" };
  } else if (q.op === "search") {
    path = "/recipes/complexSearch";
    params = {
      query: q.query || "",
      includeIngredients: q.include || "",
      intolerances: "gluten",
      addRecipeInformation: "true",
      addRecipeNutrition: "true",
      fillIngredients: "true",
      instructionsRequired: "true",
      sort: "popularity",
      number: q.number || "12",
    };
    if (q.type) params.type = q.type;
    if (q.maxReady) params.maxReadyTime = q.maxReady;
  } else if (q.op === "info") {
    path = `/recipes/${encodeURIComponent(q.id)}/information`;
    params = { includeNutrition: "true" };
  } else if (q.op === "parse") {
    // Typed/pasted ingredient lines -> names, amounts, aisles and nutrition
    let body; try { body = await req.json(); } catch { return reply(400, { error: "Bad request body" }); }
    const lines = (body.ingredients || []).map(s => String(s).trim()).filter(Boolean);
    if (!lines.length) return reply(400, { error: "No ingredient lines" });
    const form = new URLSearchParams({ ingredientList: lines.join("\n"), servings: String(body.servings || 4), includeNutrition: "true" });
    try {
      const res = await fetch(`${BASE}/recipes/parseIngredients?apiKey=${key}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      const text = await res.text();
      let out; try { out = JSON.parse(text); } catch { out = { error: text }; }
      return reply(res.status, out);
    } catch (e) { return reply(502, { error: "Could not reach Spoonacular: " + e.message }); }
  } else {
    return reply(400, { error: "Unknown op" });
  }

  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => { if (v !== "" && v != null) url.searchParams.set(k, v); });
  url.searchParams.set("apiKey", key);

  try {
    const res = await fetch(url.toString());
    const text = await res.text();
    const left = res.headers.get("x-api-quota-left");
    let body; try { body = JSON.parse(text); } catch { body = { error: text }; }
    if (left != null && body && typeof body === "object") body.quotaLeft = Number(left);
    return reply(res.status, body);
  } catch (e) {
    return reply(502, { error: "Could not reach Spoonacular: " + e.message });
  }
};

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
