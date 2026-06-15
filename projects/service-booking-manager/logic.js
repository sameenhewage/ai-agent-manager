/* Service Booking Manager - pure domain logic (no DOM, no storage).
 *
 * Loads as a classic browser <script> (sets window.SBM) AND is require()-able
 * by Node tests (module.exports), so tests run with zero dependencies.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.SBM = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalizeName(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeOptionalText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeNumber(value) {
    if (value === undefined || value === null || value === "") return undefined;
    var n = Number(value);
    return isFinite(n) ? n : undefined;
  }

  function defaultId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function defaultNow() {
    return new Date().toISOString();
  }

  function resolveDeps(deps) {
    deps = deps || {};
    return {
      id: typeof deps.id === "function" ? deps.id : defaultId,
      now: typeof deps.now === "function" ? deps.now : defaultNow
    };
  }

  function validateCustomerInput(input) {
    var errors = [];
    if (!normalizeName(input && input.name)) errors.push("Name is required");
    return { ok: errors.length === 0, errors: errors };
  }

  function validateServiceInput(input) {
    var errors = [];
    if (!normalizeName(input && input.name)) errors.push("Name is required");
    return { ok: errors.length === 0, errors: errors };
  }

  function createCustomer(input, deps) {
    var d = resolveDeps(deps);
    input = input || {};
    var customer = { id: d.id(), name: normalizeName(input.name) };
    var phone = normalizeOptionalText(input.phone);
    var email = normalizeOptionalText(input.email);
    if (phone) customer.phone = phone;
    if (email) customer.email = email;
    customer.createdAt = d.now();
    return customer;
  }

  function createService(input, deps) {
    var d = resolveDeps(deps);
    input = input || {};
    var service = { id: d.id(), name: normalizeName(input.name) };
    var duration = normalizeNumber(input.durationMinutes);
    var price = normalizeNumber(input.price);
    if (duration !== undefined) service.durationMinutes = duration;
    if (price !== undefined) service.price = price;
    service.createdAt = d.now();
    return service;
  }

  var BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled"];

  function isValidDateTime(value) {
    if (typeof value !== "string" || value.trim() === "") return false;
    return !Number.isNaN(new Date(value).getTime());
  }

  function validateBookingInput(input) {
    input = input || {};
    var errors = [];
    if (!normalizeOptionalText(input.customerId)) errors.push("Customer is required");
    if (!normalizeOptionalText(input.serviceId)) errors.push("Service is required");
    var dateTime = normalizeOptionalText(input.dateTime);
    if (!dateTime) {
      errors.push("Date and time are required");
    } else if (!isValidDateTime(dateTime)) {
      errors.push("Date and time are invalid");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function createBooking(input, deps) {
    var d = resolveDeps(deps);
    input = input || {};
    return {
      id: d.id(),
      customerId: normalizeOptionalText(input.customerId),
      serviceId: normalizeOptionalText(input.serviceId),
      dateTime: normalizeOptionalText(input.dateTime),
      status: "pending",
      createdAt: d.now()
    };
  }

  function isValidStatus(status) {
    return BOOKING_STATUSES.indexOf(status) !== -1;
  }

  function updateBookingStatus(booking, status) {
    if (!isValidStatus(status)) {
      throw new TypeError("Invalid booking status: " + status);
    }
    var updated = {};
    for (var key in booking) {
      if (Object.prototype.hasOwnProperty.call(booking, key)) {
        updated[key] = booking[key];
      }
    }
    updated.status = status;
    return updated;
  }

  function summarizeBookings(bookings) {
    bookings = Array.isArray(bookings) ? bookings : [];
    var byStatus = {};
    BOOKING_STATUSES.forEach(function (s) {
      byStatus[s] = 0;
    });
    bookings.forEach(function (b) {
      if (b && isValidStatus(b.status)) {
        byStatus[b.status] += 1;
      }
    });
    return { total: bookings.length, byStatus: byStatus };
  }

  return {
    normalizeName: normalizeName,
    normalizeNumber: normalizeNumber,
    BOOKING_STATUSES: BOOKING_STATUSES,
    validateCustomerInput: validateCustomerInput,
    validateServiceInput: validateServiceInput,
    validateBookingInput: validateBookingInput,
    createCustomer: createCustomer,
    createService: createService,
    createBooking: createBooking,
    isValidStatus: isValidStatus,
    updateBookingStatus: updateBookingStatus,
    summarizeBookings: summarizeBookings
  };
});
