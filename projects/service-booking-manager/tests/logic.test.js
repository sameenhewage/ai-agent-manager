"use strict";

const test = require("node:test");
const assert = require("node:assert");
const SBM = require("../logic.js");

const DEPS = { id: () => "id-1", now: () => "2020-01-01T00:00:00.000Z" };

test("validateCustomerInput rejects empty and whitespace names", () => {
  assert.strictEqual(SBM.validateCustomerInput({ name: "" }).ok, false);
  assert.strictEqual(SBM.validateCustomerInput({ name: "   " }).ok, false);
  assert.strictEqual(SBM.validateCustomerInput({}).ok, false);
});

test("validateCustomerInput accepts a real name", () => {
  const r = SBM.validateCustomerInput({ name: "Alice" });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.errors, []);
});

test("validateServiceInput rejects empty and whitespace names", () => {
  assert.strictEqual(SBM.validateServiceInput({ name: "" }).ok, false);
  assert.strictEqual(SBM.validateServiceInput({ name: "   " }).ok, false);
});

test("validateServiceInput accepts a real name", () => {
  assert.strictEqual(SBM.validateServiceInput({ name: "Haircut" }).ok, true);
});

test("createCustomer trims name, drops blank optionals, sets id/createdAt", () => {
  const c = SBM.createCustomer(
    { name: "  Alice  ", phone: "  ", email: " a@b.com " },
    DEPS
  );
  assert.deepStrictEqual(c, {
    id: "id-1",
    name: "Alice",
    email: "a@b.com",
    createdAt: "2020-01-01T00:00:00.000Z"
  });
});

test("createCustomer keeps phone when provided and omits missing email", () => {
  const c = SBM.createCustomer({ name: "Bob", phone: "555-1234" }, DEPS);
  assert.strictEqual(c.phone, "555-1234");
  assert.ok(!("email" in c));
});

test("createService trims name and coerces numeric duration/price", () => {
  const s = SBM.createService(
    { name: " Haircut ", durationMinutes: "30", price: "25.5" },
    DEPS
  );
  assert.deepStrictEqual(s, {
    id: "id-1",
    name: "Haircut",
    durationMinutes: 30,
    price: 25.5,
    createdAt: "2020-01-01T00:00:00.000Z"
  });
});

test("createService omits blank or non-numeric duration and price", () => {
  const s = SBM.createService(
    { name: "Wash", durationMinutes: "", price: "abc" },
    DEPS
  );
  assert.deepStrictEqual(s, {
    id: "id-1",
    name: "Wash",
    createdAt: "2020-01-01T00:00:00.000Z"
  });
});

test("createCustomer generates unique ids by default", () => {
  const a = SBM.createCustomer({ name: "A" });
  const b = SBM.createCustomer({ name: "B" });
  assert.notStrictEqual(a.id, b.id);
  assert.ok(typeof a.createdAt === "string" && a.createdAt.length > 0);
});

test("validateBookingInput requires customer, service, and date/time", () => {
  assert.strictEqual(
    SBM.validateBookingInput({ serviceId: "s1", dateTime: "2026-06-20T14:30" }).ok,
    false
  );
  assert.strictEqual(
    SBM.validateBookingInput({ customerId: "c1", dateTime: "2026-06-20T14:30" }).ok,
    false
  );
  assert.strictEqual(
    SBM.validateBookingInput({ customerId: "c1", serviceId: "s1", dateTime: "" }).ok,
    false
  );
  assert.strictEqual(
    SBM.validateBookingInput({ customerId: "c1", serviceId: "s1", dateTime: "   " }).ok,
    false
  );
  assert.strictEqual(
    SBM.validateBookingInput({ customerId: "c1", serviceId: "s1", dateTime: "not-a-date" }).ok,
    false
  );
});

test("validateBookingInput accepts a complete, valid booking", () => {
  const r = SBM.validateBookingInput({
    customerId: "c1",
    serviceId: "s1",
    dateTime: "2026-06-20T14:30"
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.errors, []);
});

test("createBooking builds a pending booking and preserves dateTime", () => {
  const b = SBM.createBooking(
    { customerId: "c1", serviceId: "s1", dateTime: "2026-06-20T14:30" },
    DEPS
  );
  assert.deepStrictEqual(b, {
    id: "id-1",
    customerId: "c1",
    serviceId: "s1",
    dateTime: "2026-06-20T14:30",
    status: "pending",
    createdAt: "2020-01-01T00:00:00.000Z"
  });
});

test("createBooking forces pending even if a status is supplied", () => {
  const b = SBM.createBooking(
    {
      customerId: "c1",
      serviceId: "s1",
      dateTime: "2026-06-20T14:30",
      status: "confirmed"
    },
    DEPS
  );
  assert.strictEqual(b.status, "pending");
});

test("BOOKING_STATUSES lists the four statuses in order", () => {
  assert.deepStrictEqual(SBM.BOOKING_STATUSES, [
    "pending",
    "confirmed",
    "completed",
    "cancelled"
  ]);
});

test("isValidStatus accepts the four statuses and rejects others", () => {
  ["pending", "confirmed", "completed", "cancelled"].forEach((s) => {
    assert.strictEqual(SBM.isValidStatus(s), true);
  });
  assert.strictEqual(SBM.isValidStatus("foo"), false);
  assert.strictEqual(SBM.isValidStatus(""), false);
  assert.strictEqual(SBM.isValidStatus(undefined), false);
});

test("updateBookingStatus returns a new booking and leaves the original unchanged", () => {
  const original = SBM.createBooking(
    { customerId: "c1", serviceId: "s1", dateTime: "2026-06-20T14:30" },
    DEPS
  );
  const updated = SBM.updateBookingStatus(original, "confirmed");
  assert.strictEqual(updated.status, "confirmed");
  assert.strictEqual(original.status, "pending");
  assert.notStrictEqual(updated, original);
  assert.strictEqual(updated.id, original.id);
});

test("updateBookingStatus throws on an invalid status", () => {
  const b = SBM.createBooking(
    { customerId: "c1", serviceId: "s1", dateTime: "2026-06-20T14:30" },
    DEPS
  );
  assert.throws(() => SBM.updateBookingStatus(b, "archived"));
});

test("summarizeBookings returns zeros for an empty list", () => {
  assert.deepStrictEqual(SBM.summarizeBookings([]), {
    total: 0,
    byStatus: { pending: 0, confirmed: 0, completed: 0, cancelled: 0 }
  });
});

test("summarizeBookings counts totals and per-status", () => {
  const bookings = [
    { status: "pending" },
    { status: "pending" },
    { status: "confirmed" },
    { status: "completed" },
    { status: "cancelled" },
    { status: "cancelled" }
  ];
  assert.deepStrictEqual(SBM.summarizeBookings(bookings), {
    total: 6,
    byStatus: { pending: 2, confirmed: 1, completed: 1, cancelled: 2 }
  });
});
