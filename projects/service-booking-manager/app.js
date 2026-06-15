/* Service Booking Manager - UI wiring + persistence for Customers, Services,
 * and Bookings. Depends on window.SBM from logic.js.
 */
(function () {
  "use strict";

  var STORAGE_KEYS = {
    customers: "sbm.customers",
    services: "sbm.services",
    bookings: "sbm.bookings"
  };

  var state = {
    customers: [],
    services: [],
    bookings: []
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function load(key) {
    try {
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function save(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (err) {
      /* storage unavailable/full - ignore for this workflow-test app */
    }
  }

  function setError(el, message) {
    el.textContent = message || "";
  }

  function makeItem(name, metaParts) {
    var li = document.createElement("li");
    li.className = "item";
    var nameEl = document.createElement("span");
    nameEl.className = "item__name";
    nameEl.textContent = name == null ? "" : String(name);
    li.appendChild(nameEl);
    var parts = (metaParts || []).filter(Boolean);
    if (parts.length) {
      var metaEl = document.createElement("span");
      metaEl.className = "item__meta";
      metaEl.textContent = parts.join(" \u00b7 ");
      li.appendChild(metaEl);
    }
    return li;
  }

  // ---- Customers ----
  function renderCustomers() {
    var listEl = byId("customer-list");
    var emptyEl = byId("customer-empty");
    listEl.innerHTML = "";
    if (state.customers.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    state.customers.forEach(function (c) {
      listEl.appendChild(makeItem(c.name, [c.phone, c.email]));
    });
  }

  function handleCustomerSubmit(event) {
    event.preventDefault();
    var errorEl = byId("customer-error");
    var nameEl = byId("customer-name");
    var input = {
      name: nameEl.value,
      phone: byId("customer-phone").value,
      email: byId("customer-email").value
    };
    var result = window.SBM.validateCustomerInput(input);
    if (!result.ok) {
      setError(errorEl, result.errors.join(", "));
      nameEl.focus();
      return;
    }
    setError(errorEl, "");
    state.customers.push(window.SBM.createCustomer(input));
    save(STORAGE_KEYS.customers, state.customers);
    renderCustomers();
    refreshBookingOptions();
    renderDashboard();
    event.target.reset();
    nameEl.focus();
  }

  // ---- Services ----
  function renderServices() {
    var listEl = byId("service-list");
    var emptyEl = byId("service-empty");
    listEl.innerHTML = "";
    if (state.services.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    state.services.forEach(function (s) {
      var meta = [
        s.durationMinutes !== undefined ? s.durationMinutes + " min" : "",
        s.price !== undefined ? "$" + s.price : ""
      ];
      listEl.appendChild(makeItem(s.name, meta));
    });
  }

  function handleServiceSubmit(event) {
    event.preventDefault();
    var errorEl = byId("service-error");
    var nameEl = byId("service-name");
    var input = {
      name: nameEl.value,
      durationMinutes: byId("service-duration").value,
      price: byId("service-price").value
    };
    var result = window.SBM.validateServiceInput(input);
    if (!result.ok) {
      setError(errorEl, result.errors.join(", "));
      nameEl.focus();
      return;
    }
    setError(errorEl, "");
    state.services.push(window.SBM.createService(input));
    save(STORAGE_KEYS.services, state.services);
    renderServices();
    refreshBookingOptions();
    renderDashboard();
    event.target.reset();
    nameEl.focus();
  }

  // ---- Bookings ----
  function formatDateTime(value) {
    if (!value) return "";
    var d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function fillSelect(selectEl, items, placeholder) {
    var previous = selectEl.value;
    selectEl.innerHTML = "";
    var placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = placeholder;
    selectEl.appendChild(placeholderOption);
    items.forEach(function (it) {
      var option = document.createElement("option");
      option.value = it.id;
      option.textContent = it.name;
      selectEl.appendChild(option);
    });
    selectEl.value = previous;
    if (selectEl.value !== previous) selectEl.value = "";
  }

  function updateBookingAvailability() {
    var hintEl = byId("booking-hint");
    var canBook = state.customers.length > 0 && state.services.length > 0;
    byId("booking-submit").disabled = !canBook;
    if (canBook) {
      hintEl.textContent = "";
      hintEl.hidden = true;
    } else {
      hintEl.textContent = "Add at least one customer and one service first.";
      hintEl.hidden = false;
    }
  }

  function refreshBookingOptions() {
    fillSelect(byId("booking-customer"), state.customers, "Select a customer");
    fillSelect(byId("booking-service"), state.services, "Select a service");
    updateBookingAvailability();
  }

  function renderBookings() {
    var listEl = byId("booking-list");
    var emptyEl = byId("booking-empty");
    listEl.innerHTML = "";
    if (state.bookings.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    state.bookings.forEach(function (b) {
      var customer = findById(state.customers, b.customerId);
      var service = findById(state.services, b.serviceId);

      var li = document.createElement("li");
      li.className = "item";

      var title = document.createElement("span");
      title.className = "item__name";
      title.textContent =
        (customer ? customer.name : "Unknown customer") +
        " \u2014 " +
        (service ? service.name : "Unknown service");
      li.appendChild(title);

      var meta = document.createElement("span");
      meta.className = "item__meta";
      meta.textContent = formatDateTime(b.dateTime);
      li.appendChild(meta);

      var statusSelect = document.createElement("select");
      statusSelect.className = "status-select status--" + b.status;
      statusSelect.name = "booking-status-" + b.id;
      statusSelect.setAttribute("aria-label", "Booking status");
      window.SBM.BOOKING_STATUSES.forEach(function (s) {
        var option = document.createElement("option");
        option.value = s;
        option.textContent = s.charAt(0).toUpperCase() + s.slice(1);
        statusSelect.appendChild(option);
      });
      statusSelect.value = b.status;
      statusSelect.addEventListener("change", function () {
        changeBookingStatus(b.id, statusSelect.value);
      });
      li.appendChild(statusSelect);

      listEl.appendChild(li);
    });
  }

  function handleBookingSubmit(event) {
    event.preventDefault();
    var errorEl = byId("booking-error");
    var input = {
      customerId: byId("booking-customer").value,
      serviceId: byId("booking-service").value,
      dateTime: byId("booking-datetime").value
    };
    var result = window.SBM.validateBookingInput(input);
    if (!result.ok) {
      setError(errorEl, result.errors.join(", "));
      return;
    }
    setError(errorEl, "");
    state.bookings.push(window.SBM.createBooking(input));
    save(STORAGE_KEYS.bookings, state.bookings);
    renderBookings();
    renderDashboard();
    event.target.reset();
  }

  function changeBookingStatus(id, status) {
    var index = -1;
    for (var i = 0; i < state.bookings.length; i++) {
      if (state.bookings[i].id === id) {
        index = i;
        break;
      }
    }
    if (index === -1) return;
    state.bookings[index] = window.SBM.updateBookingStatus(state.bookings[index], status);
    save(STORAGE_KEYS.bookings, state.bookings);
    renderBookings();
    renderDashboard();
  }

  function renderDashboard() {
    var summary = window.SBM.summarizeBookings(state.bookings);
    byId("dash-customers").textContent = state.customers.length;
    byId("dash-services").textContent = state.services.length;
    byId("dash-bookings").textContent = summary.total;
    byId("dash-pending").textContent = summary.byStatus.pending;
    byId("dash-confirmed").textContent = summary.byStatus.confirmed;
    byId("dash-completed").textContent = summary.byStatus.completed;
    byId("dash-cancelled").textContent = summary.byStatus.cancelled;
  }

  function init() {
    state.customers = load(STORAGE_KEYS.customers);
    state.services = load(STORAGE_KEYS.services);
    state.bookings = load(STORAGE_KEYS.bookings);
    byId("customer-form").addEventListener("submit", handleCustomerSubmit);
    byId("service-form").addEventListener("submit", handleServiceSubmit);
    byId("booking-form").addEventListener("submit", handleBookingSubmit);
    renderCustomers();
    renderServices();
    refreshBookingOptions();
    renderBookings();
    renderDashboard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
