import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Compile this dependency-free sender for the Node runner. All network calls are mocked.
const source = await readFile(new URL("../src/lib/email/resend.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { sendQueuedEmail } = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
const email = {
  id: "test-event", claim_token: "test-claim", attempts: 1,
  body_text: "Your fictional Forma booking is confirmed.",
  delivery_from: "Forma <sender@example.test>",
  delivery_to: "owner@example.test",
  delivery_subject: "[TEST] Your Forma session is confirmed",
};

test("sender uses queued recipient, immutable content and a stable idempotency key", async () => {
  const requests = [];
  const mock = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ id: "provider-test-id" }), { status: 200 });
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal((await sendQueuedEmail(email, "fake-test-key", mock)).accepted, true);
  }
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  assert.equal(requests[0].options.headers["Idempotency-Key"], "forma-email/test-event");
  assert.equal(requests[0].options.headers["Idempotency-Key"], requests[1].options.headers["Idempotency-Key"]);
  assert.deepEqual(JSON.parse(requests[0].options.body).to, ["owner@example.test"]);
  assert.equal(JSON.parse(requests[0].options.body).text, email.body_text);
});
test("provider rejection does not report delivery success or expose its response body", async () => {
  const result = await sendQueuedEmail(email, "fake-test-key", async () => new Response("sensitive-provider-detail", { status: 429 }));
  assert.deepEqual(result, { accepted: false, reason: "Provider HTTP 429" });
});
test("timeouts and network failures are retryable without exposing credentials", async () => {
  const result = await sendQueuedEmail(email, "fake-test-key", async () => { throw new Error("private details"); });
  assert.deepEqual(result, { accepted: false, reason: "Provider timeout or connection failure" });
});
test("an invalid success response is not marked accepted", async () => {
  const result = await sendQueuedEmail(email, "fake-test-key", async () => new Response("{}", { status: 200 }));
  assert.deepEqual(result, { accepted: false, reason: "Invalid provider response" });
});
