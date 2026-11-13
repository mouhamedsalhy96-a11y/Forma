import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const clientA = "00000000-0000-0000-0000-000000000001";
const clientB = "00000000-0000-0000-0000-000000000002";
const trainer = "00000000-0000-0000-0000-000000000003";

// These tests use disposable local PostgreSQL and a minimal Supabase Auth stub.
// They exercise SQL permissions and functions, not live auth or network concurrency.
test("Forma database permissions and booking workflows", async context => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    const migrations = new URL("../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(migrations)).filter(name => name.endsWith(".sql")).sort()) {
      await db.exec(await readFile(new URL(name, migrations), "utf8"));
    }
    await db.query("insert into auth.users (id, email) values ($1, 'client-a@example.test'), ($2, 'client-b@example.test'), ($3, 'trainer@example.test')", [clientA, clientB, trainer]);
    await db.query("insert into public.studio_trainers(user_id) values ($1)", [trainer]);

    async function asUser(id) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
      await db.exec("set local role authenticated");
    }
    async function firstSlot() {
      return (await db.query("select id from public.forma_available_slots() limit 1")).rows[0].id;
    }
    async function book(slot, service = "strength", name = "Test Client") {
      return (await db.query("select (public.forma_book_slot($1, $2, $3)).*", [slot, service, name])).rows[0];
    }
    async function denied(sql, parameters = [], code = "42501") {
      // PostgreSQL errors abort the current transaction until a savepoint is rolled back.
      await db.exec("savepoint expected_failure");
      let failure;
      try { await db.query(sql, parameters); } catch (error) { failure = error; }
      await db.exec("rollback to savepoint expected_failure");
      await db.exec("release savepoint expected_failure");
      assert.ok(failure, "Expected the database to reject this operation");
      assert.equal(failure.code, code);
    }
    async function check(name, run) {
      await context.test(name, async () => {
        await db.exec("begin");
        try { await run(); } finally { await db.exec("rollback"); }
      });
    }

    await check("anonymous visitors cannot read bookings or execute booking functions", async () => {
      await db.exec("set local role anon");
      await denied("select * from public.studio_bookings");
      await denied("select * from public.forma_available_slots()");
      await denied("select public.forma_book_slot(gen_random_uuid(), 'strength', 'Test')");
    });
    await check("clients see only their own bookings", async () => {
      await asUser(clientA);
      const booking = await book(await firstSlot());
      assert.equal(booking.user_id, clientA);
      await asUser(clientB);
      assert.equal((await db.query("select * from public.studio_bookings")).rows.length, 0);
      await asUser(clientA);
      assert.equal((await db.query("select id from public.studio_bookings")).rows[0].id, booking.id);
    });
    await check("prices and duration come from the service record", async () => {
      await asUser(clientA);
      const booking = await book(await firstSlot(), "conditioning");
      assert.equal(booking.price_pence, 3500);
      assert.equal(booking.duration_minutes, 45);
      await denied("update public.studio_bookings set price_pence = 0");
      await denied("insert into public.studio_bookings default values");
    });
    await check("repeating the same booking returns the original record", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      const original = await book(slot);
      assert.equal((await book(slot)).id, original.id);
      assert.equal((await db.query("select * from public.studio_bookings")).rows.length, 1);
    });
    await check("a second client cannot book an occupied slot", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      await book(slot);
      await asUser(clientB);
      await denied("select public.forma_book_slot($1, 'strength', 'Test B')", [slot], "23505");
    });
    await check("the unique index independently rejects duplicate active bookings", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      await book(slot);
      await db.exec("reset role");
      await denied(`insert into public.studio_bookings
        (user_id, slot_id, service_id, client_name, price_pence, duration_minutes)
        values ($1, $2, 'strength', 'Duplicate', 4500, 60)`, [clientB, slot], "23505");
    });
    await check("invalid services and blank client names are rejected", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      await denied("select public.forma_book_slot($1, 'unknown', 'Test')", [slot], "22023");
      await denied("select public.forma_book_slot($1, 'strength', '   ')", [slot], "22023");
    });
    await check("only the owner can use client cancellation", async () => {
      await asUser(clientA);
      const booking = await book(await firstSlot());
      await asUser(clientB);
      await denied("select public.forma_cancel_booking($1)", [booking.id]);
    });
    await check("cancellation is repeatable, retains history and releases the slot", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      const booking = await book(slot);
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await db.query("select (public.forma_cancel_booking($1)).status", [booking.id]);
        assert.equal(result.rows[0].status, "cancelled");
      }
      assert.equal((await db.query("select available from public.forma_available_slots() where id=$1", [slot])).rows[0].available, true);
      await asUser(clientB);
      assert.equal((await book(slot)).user_id, clientB);
      await asUser(clientA);
      assert.equal((await db.query("select status from public.studio_bookings where id=$1", [booking.id])).rows[0].status, "cancelled");
    });
    await check("clients cannot promote themselves or list trainer memberships", async () => {
      await asUser(clientA);
      assert.equal((await db.query("select * from public.studio_trainers")).rows.length, 0);
      await denied("insert into public.studio_trainers(user_id) values ($1)", [clientA]);
    });
    await check("trainers can read client bookings and access revocation takes effect", async () => {
      await asUser(clientA);
      await book(await firstSlot());
      await asUser(trainer);
      assert.equal((await db.query("select * from public.studio_bookings")).rows.length, 1);
      await db.exec("reset role");
      await db.query("delete from public.studio_trainers where user_id=$1", [trainer]);
      await asUser(trainer);
      assert.equal((await db.query("select * from public.studio_bookings")).rows.length, 0);
      await denied("select * from public.forma_trainer_slots()");
    });
    await check("clients cannot publish, hide or list trainer slots", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      await denied("select public.forma_publish_slot(current_date + 20, time '09:00')");
      await denied("select public.forma_set_slot_published($1,false)", [slot]);
      await denied("select * from public.forma_trainer_slots()");
    });
    await check("trainers can publish and hide slots, and overlaps are rejected", async () => {
      await asUser(trainer);
      const slot = (await db.query(`select (public.forma_publish_slot(
        (now() at time zone 'Europe/London')::date + 20, time '09:00')).id`)).rows[0].id;
      await denied(`select public.forma_publish_slot(
        (now() at time zone 'Europe/London')::date + 20, time '09:30')`, [], "23P01");
      await db.query("select public.forma_set_slot_published($1,false)", [slot]);
      await asUser(clientA);
      assert.equal((await db.query("select * from public.forma_available_slots() where id=$1", [slot])).rows.length, 0);
      await denied("select public.forma_book_slot($1,'strength','Test')", [slot], "22023");
      await asUser(trainer);
      await db.query("select public.forma_set_slot_published($1,true)", [slot]);
      await asUser(clientA);
      assert.equal((await book(slot)).slot_id, slot);
    });
    await check("booked slots cannot be hidden", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      await book(slot);
      await asUser(trainer);
      await denied("select public.forma_set_slot_published($1,false)", [slot], "22023");
    });
    await check("cancelled clients retain slot history after the trainer hides it", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      const booking = await book(slot);
      await db.query("select public.forma_cancel_booking($1)", [booking.id]);
      await asUser(trainer);
      await db.query("select public.forma_set_slot_published($1,false)", [slot]);
      await asUser(clientA);
      assert.equal((await db.query("select id from public.studio_slots where id=$1", [slot])).rows[0].id, slot);
    });
    await check("trainer cancellation works, is repeatable, and is denied to clients", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      const booking = await book(slot);
      await denied("select public.forma_trainer_cancel_booking($1)", [booking.id]);
      await asUser(trainer);
      for (let attempt = 0; attempt < 2; attempt++) {
        assert.equal((await db.query("select (public.forma_trainer_cancel_booking($1)).status", [booking.id])).rows[0].status, "cancelled");
      }
      await asUser(clientA);
      assert.equal((await db.query("select available from public.forma_available_slots() where id=$1", [slot])).rows[0].available, true);
    });
    await check("started sessions cannot be cancelled by owner or trainer", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      const booking = await book(slot);
      await db.exec("reset role");
      await db.query("update public.studio_slots set starts_at=now()-interval '1 hour',ends_at=now() where id=$1", [slot]);
      await asUser(clientA);
      await denied("select public.forma_cancel_booking($1)", [booking.id], "22023");
      await asUser(trainer);
      await denied("select public.forma_trainer_cancel_booking($1)", [booking.id], "22023");
    });

    await check("booking and cancellation enqueue one immutable email each", async () => {
      await asUser(clientA);
      const slot = await firstSlot();
      const booking = await book(slot);
      await book(slot);
      await db.exec("reset role");
      let events = (await db.query("select * from public.studio_email_outbox where booking_id=$1", [booking.id])).rows;
      assert.equal(events.length, 1);
      assert.equal(events[0].recipient, "client-a@example.test");
      assert.equal(events[0].event, "confirmed");
      assert.match(events[0].body_text, /Europe\/London/);
      await asUser(clientA);
      await db.query("select public.forma_cancel_booking($1)", [booking.id]);
      await db.query("select public.forma_cancel_booking($1)", [booking.id]);
      await db.exec("reset role");
      events = (await db.query("select * from public.studio_email_outbox where booking_id=$1", [booking.id])).rows;
      assert.equal(events.length, 2);
    });
    await check("clients and trainers cannot read email recipients or claim jobs", async () => {
      for (const id of [clientA, trainer]) {
        await asUser(id);
        await denied("select * from public.studio_email_outbox");
        await denied("select * from public.forma_claim_booking_emails(null,'Forma <test@example.test>',null)");
      }
    });
    await check("test mode redirects to the test recipient and claims each event once", async () => {
      await asUser(clientA);
      const booking = await book(await firstSlot());
      await db.exec("reset role; set local role service_role");
      const first = (await db.query("select * from public.forma_claim_booking_emails($1,$2,$3)", [booking.id, "Forma <onboarding@resend.dev>", "owner@example.test"])).rows;
      assert.equal(first.length, 1);
      assert.equal(first[0].delivery_to, "owner@example.test");
      assert.equal(first[0].delivery_subject, "[TEST] Your Forma session is confirmed");
      assert.equal(first[0].attempts, 1);
      assert.ok(first[0].claim_token);
      assert.equal((await db.query("select * from public.forma_claim_booking_emails($1,$2,$3)", [booking.id, "Forma <other@example.test>", "other@example.test"])).rows.length, 0);
    });
    await check("a retry retains its exact sender, recipient and subject", async () => {
      await asUser(clientA);
      const booking = await book(await firstSlot());
      await db.exec("reset role; set local role service_role");
      const first = (await db.query("select * from public.forma_claim_booking_emails($1,$2,$3)", [booking.id, "Forma <original@example.test>", "test@example.test"])).rows[0];
      await db.query("update public.studio_email_outbox set lease_until=now()-interval '1 minute' where id=$1", [first.id]);
      const second = (await db.query("select * from public.forma_claim_booking_emails($1,$2,$3)", [booking.id, "Forma <changed@example.test>", "changed@example.test"])).rows[0];
      assert.equal(first.id, second.id);
      assert.equal(second.attempts, 2);
      assert.equal(second.delivery_from, first.delivery_from);
      assert.equal(second.delivery_to, first.delivery_to);
      assert.equal(second.delivery_subject, first.delivery_subject);
      assert.notEqual(second.claim_token, first.claim_token);
    });
    await check("cancellation suppresses a confirmation that has not been sent", async () => {
      await asUser(clientA);
      const booking = await book(await firstSlot());
      await db.query("select public.forma_cancel_booking($1)", [booking.id]);
      await db.exec("reset role; set local role service_role");
      const jobs = (await db.query("select * from public.forma_claim_booking_emails($1,$2,null)", [booking.id, "Forma <sender@example.test>"])).rows;
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].event, "cancelled");
      assert.equal((await db.query("select status from public.studio_email_outbox where booking_id=$1 and event='confirmed'", [booking.id])).rows[0].status, "skipped");
    });
    await check("completed jobs cannot be claimed again", async () => {
      await asUser(clientA);
      const booking = await book(await firstSlot());
      await db.exec("reset role; set local role service_role");
      const job = (await db.query("select * from public.forma_claim_booking_emails($1,$2,null)", [booking.id, "Forma <sender@example.test>"])).rows[0];
      await db.query("update public.studio_email_outbox set status='sent',sent_at=now(),lease_until=null where id=$1", [job.id]);
      assert.equal((await db.query("select * from public.forma_claim_booking_emails($1,$2,null)", [booking.id, "Forma <sender@example.test>"])).rows.length, 0);
    });
    await check("email jobs outside the idempotency window stop retrying", async () => {
      await asUser(clientA);
      const booking = await book(await firstSlot());
      await db.exec("reset role; set local role service_role");
      await db.query("update public.studio_email_outbox set first_attempt_at=now()-interval '24 hours',attempts=1 where booking_id=$1", [booking.id]);
      assert.equal((await db.query("select * from public.forma_claim_booking_emails($1,$2,null)", [booking.id, "Forma <sender@example.test>"])).rows.length, 0);
      assert.equal((await db.query("select status from public.studio_email_outbox where booking_id=$1", [booking.id])).rows[0].status, "failed");
    });
    await check("published slots must be future quarter-hour times inside the booking window", async () => {
      await asUser(trainer);
      for (const expression of [
        "current_date - 1, time '09:00'",
        "current_date + 40, time '09:00'",
        "current_date + 20, time '05:00'",
        "current_date + 20, time '09:07'",
      ]) {
        await denied("select public.forma_publish_slot(" + expression + ")", [], "22023");
      }
    });
  } finally { await db.close(); }
});
