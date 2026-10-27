
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);

  const ordersList = $("ordersList");
  const message = $("message");
  const connectionStatus = $("connectionStatus");
  const activeCount = $("activeCount");
  const activeValue = $("activeValue");
  const itemCount = $("itemCount");
  const refreshBtn = $("refreshBtn");
  const printArea = $("printArea");

  let unsubscribe = null;
  let currentOrders = [];
  let customerBills = [];

  const money = value =>
    "₹" + (Number(value) || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function getPhone(order) {
    return String(
      order.customerPhone ||
      order.customerMobile ||
      order.mobile ||
      ""
    ).trim();
  }

  function getOrderTime(order) {
    const timestamp = order.createdAt;

    if (timestamp && typeof timestamp.toDate === "function") {
      return timestamp.toDate();
    }

    if (typeof order.createdAtMs === "number") {
      return new Date(order.createdAtMs);
    }

    if (typeof timestamp === "string" || typeof timestamp === "number") {
      const date = new Date(timestamp);
      if (!Number.isNaN(date.getTime())) return date;
    }

    return null;
  }

  function formatDate(date) {
    if (!date || Number.isNaN(date.getTime())) {
      return "Time unavailable";
    }

    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function normalizeItems(order) {
    if (!Array.isArray(order.items)) return [];

    return order.items.map(item => {
      const qty = Math.max(
        0,
        Number(item.qty ?? item.quantity ?? 1) || 0
      );

      const price = Math.max(0, Number(item.price) || 0);

      return {
        name: String(item.name || item.title || "Food Item").trim(),
        price,
        qty
      };
    }).filter(item => item.qty > 0);
  }

  /*
   * Group orders by customer mobile number.
   * Each mobile number gets exactly one active bill card.
   */
  function buildCustomerBills(orders) {
    const groups = new Map();

    orders.forEach(order => {
      const phone = getPhone(order);

      // Orders without a phone cannot safely be grouped together.
      // Keep each such order separate.
      const groupKey = phone
        ? "phone:" + phone
        : "order:" + order.id;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          phone: phone || "Mobile number unavailable",
          orders: [],
          itemsMap: new Map(),
          firstOrderTime: null,
          latestOrderTime: null,
          orderType: order.orderType || "Takeaway",
          tableNumber: order.tableNumber || "",
          notes: [],
          total: 0
        });
      }

      const group = groups.get(groupKey);
      group.orders.push(order);

      const time = getOrderTime(order);

      if (time) {
        if (!group.firstOrderTime || time < group.firstOrderTime) {
          group.firstOrderTime = time;
        }

        if (!group.latestOrderTime || time > group.latestOrderTime) {
          group.latestOrderTime = time;
        }
      }

      if (order.tableNumber) {
        group.tableNumber = order.tableNumber;
      }

      if (order.orderType) {
        group.orderType = order.orderType;
      }

      if (order.notes && !group.notes.includes(String(order.notes))) {
        group.notes.push(String(order.notes));
      }

      const items = normalizeItems(order);

      items.forEach(item => {
        // Merge only items with the same name AND same price.
        const itemKey = item.name.toLowerCase() + "|" + item.price;

        if (group.itemsMap.has(itemKey)) {
          group.itemsMap.get(itemKey).qty += item.qty;
        } else {
          group.itemsMap.set(itemKey, {
            name: item.name,
            price: item.price,
            qty: item.qty
          });
        }
      });
    });

    groups.forEach(group => {
      group.items = Array.from(group.itemsMap.values());

      group.items.forEach(item => {
        item.total = Number((item.price * item.qty).toFixed(2));
      });

      group.total = Number(
        group.items.reduce((sum, item) => sum + item.total, 0).toFixed(2)
      );

      group.orderCount = group.orders.length;

      group.orderIds = group.orders.map(order => order.id);

      group.orderNumbers = group.orders.map(order =>
        String(order.orderId || order.id)
      );

      group.orders.sort((a, b) => {
        const aTime = getOrderTime(a)?.getTime() || 0;
        const bTime = getOrderTime(b)?.getTime() || 0;
        return aTime - bTime;
      });

      group.billKey = group.phone === "Mobile number unavailable"
        ? group.orderIds[0]
        : group.phone;
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aTime = a.latestOrderTime?.getTime() || 0;
      const bTime = b.latestOrderTime?.getTime() || 0;
      return bTime - aTime;
    });
  }

  function updateStats() {
    activeCount.textContent = String(customerBills.length);

    const totalValue = customerBills.reduce(
      (sum, bill) => sum + bill.total,
      0
    );

    const totalItems = customerBills.reduce(
      (sum, bill) => sum + bill.items.reduce(
        (itemSum, item) => itemSum + item.qty,
        0
      ),
      0
    );

    activeValue.textContent = money(totalValue);
    itemCount.textContent = String(totalItems);
  }

  function renderBills() {
    customerBills = buildCustomerBills(currentOrders);
    updateStats();
    ordersList.replaceChildren();

    if (!customerBills.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent =
        "No active bills right now. New customer orders will appear here automatically.";
      ordersList.appendChild(empty);
      message.textContent = "";
      return;
    }

    message.textContent = "";

    customerBills.forEach(bill => {
      const card = document.createElement("article");
      card.className = "order-card";

      const itemRows = bill.items.length
        ? bill.items.map(item => `
            <div class="item-row">
              <div>
                <span class="item-name">${escapeHTML(item.name)}</span>
                <span class="item-sub">
                  ${money(item.price)} × ${item.qty}
                </span>
              </div>
              <span class="item-price">${money(item.total)}</span>
            </div>
          `).join("")
        : '<p class="muted">No food items found in these orders.</p>';

      const orderIDs = bill.orderNumbers
        .map(id => escapeHTML(id.slice(-8)))
        .join(", ");

      const statusList = [
        ...new Set(bill.orders.map(order => order.status || "Received"))
      ].join(", ");

      card.innerHTML = `
        <div class="order-head">
          <div>
            <div class="order-number">Customer Bill</div>
            <div class="order-time">
              Mobile: ${escapeHTML(bill.phone)}
            </div>
            <div class="order-time">
              ${bill.orderCount} order(s) combined
            </div>
          </div>
          <span class="order-badge">${bill.orderCount} order(s)</span>
        </div>

        <div class="customer-info">
          <div><strong>Customer Mobile:</strong>
            ${escapeHTML(bill.phone)}
          </div>
          <div><strong>Order IDs:</strong> ${orderIDs}</div>
          <div><strong>Order Type:</strong>
            ${escapeHTML(bill.orderType)}
          </div>
          <div><strong>Table:</strong>
            <span class="table-label">
              ${escapeHTML(bill.tableNumber || "Not assigned")}
            </span>
          </div>
          <div><strong>Status:</strong> ${escapeHTML(statusList)}</div>
          <div><strong>First Order:</strong>
            ${escapeHTML(formatDate(bill.firstOrderTime))}
          </div>
          <div><strong>Latest Order:</strong>
            ${escapeHTML(formatDate(bill.latestOrderTime))}
          </div>
          ${bill.notes.length
            ? `<div><strong>Notes:</strong> ${escapeHTML(bill.notes.join(" | "))}</div>`
            : ""}
        </div>

        <div class="items-wrap">
          <div class="items-title">COMBINED BILL ITEMS</div>
          ${itemRows}
        </div>

        <div class="bill-total">
          <span>Grand Total</span>
          <strong>${money(bill.total)}</strong>
        </div>

        <div class="order-actions">
          <button class="action-btn print-btn" type="button"
            data-action="print">
            Print Combined Bill
          </button>
          <button class="action-btn complete-btn" type="button"
            data-action="complete">
            Complete All Orders
          </button>
        </div>
      `;

      card.querySelector('[data-action="print"]')
        .addEventListener("click", () => printBill(bill));

      card.querySelector('[data-action="complete"]')
        .addEventListener("click", event => {
          completeBill(bill, event.currentTarget);
        });

      ordersList.appendChild(card);
    });
  }

  function printBill(bill) {
    const rows = bill.items.map(item => `
      <tr>
        <td>${escapeHTML(item.name)}</td>
        <td>${item.qty}</td>
        <td>${money(item.price)}</td>
        <td>${money(item.total)}</td>
      </tr>
    `).join("");

    const orderIDs = bill.orderNumbers
      .map(id => escapeHTML(id))
      .join(", ");

    printArea.innerHTML = `
      <h2>Restaurant Bill</h2>
      <p style="text-align:center">Combined Customer Bill</p>
      <hr>
      <p><strong>Customer Mobile:</strong> ${escapeHTML(bill.phone)}</p>
      <p><strong>Order IDs:</strong> ${orderIDs}</p>
      <p><strong>First Order:</strong>
        ${escapeHTML(formatDate(bill.firstOrderTime))}
      </p>
      <p><strong>Latest Order:</strong>
        ${escapeHTML(formatDate(bill.latestOrderTime))}
      </p>
      <p><strong>Order Count:</strong> ${bill.orderCount}</p>
      <p><strong>Order Type:</strong> ${escapeHTML(bill.orderType)}</p>
      <p><strong>Table:</strong>
        ${escapeHTML(bill.tableNumber || "Not assigned")}
      </p>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="print-grand-total">Grand Total: ${money(bill.total)}</p>
      <p style="text-align:center;margin-top:30px">
        Thank you for your order!
      </p>
    `;

    window.print();
  }

  async function completeBill(bill, button) {
    const fb = window.billingFirebase;

    if (!fb) {
      alert("Firebase is not connected.");
      return;
    }

    const confirmed = window.confirm(
      "Complete the combined bill for " + bill.phone + "?\n\n" +
      "This will remove " + bill.orderCount +
      " active order(s) from the Billing App."
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Completing...";

    try {
      // Delete only the active billing documents.
      // The separate orders collection is not deleted.
      for (const orderId of bill.orderIds) {
        await fb.deleteDoc(
          fb.doc(fb.db, "activeOrders", orderId)
        );
      }
    } catch (error) {
      console.error("Complete bill error:", error);
      alert(
        "Some orders could not be completed. Please refresh and check the active bill.\n" +
        (error.message || "")
      );
      button.disabled = false;
      button.textContent = "Complete All Orders";
    }
  }

  function connectFirebase() {
    const fb = window.billingFirebase;

    if (!fb) {
      connectionStatus.textContent = "Not connected";
      message.textContent =
        "Firebase is not ready. Check firebase.js and open the app using HTTPS hosting.";
      return;
    }

    if (unsubscribe) unsubscribe();

    connectionStatus.textContent = "Connecting…";
    message.textContent = "Loading active orders…";

    unsubscribe = fb.onSnapshot(
      fb.collection(fb.db, "activeOrders"),
      snapshot => {
        currentOrders = snapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id
        }));

        renderBills();
        connectionStatus.textContent = "Connected";
      },
      error => {
        console.error("Billing listener error:", error);
        connectionStatus.textContent = "Connection error";
        message.textContent =
          "Unable to load active orders. Check internet and Firestore Rules. " +
          (error.message || "");
      }
    );
  }

  refreshBtn?.addEventListener("click", connectFirebase);

  connectFirebase();
});
