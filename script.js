/* ===========================================
   BILLING APP - FINAL WORKING VERSION
=========================================== */

const billContainer=document.getElementById("billContainer");
const emptyBills=document.getElementById("emptyBills");

const searchPhone=document.getElementById("searchPhone");

const billPopup=document.getElementById("billPopup");
const billDetails=document.getElementById("billDetails");

const closeBill=document.getElementById("closeBill");
const printBill=document.getElementById("printBill");

let currentBills={};

/* =========================
   LOAD ACTIVE ORDERS
========================= */

function loadBills(){

const q=fb.query(

fb.collection(db,"activeOrders"),

fb.orderBy("updatedAt","desc")

);

fb.onSnapshot(q,(snapshot)=>{

billContainer.innerHTML="";
currentBills={};

let totalSales=0;
let totalOrders=0;

if(snapshot.empty){

billContainer.style.display="none";
emptyBills.style.display="block";

document.getElementById("todayOrders").innerText="0";
document.getElementById("todaySales").innerText="₹0";

return;

}

billContainer.style.display="grid";
emptyBills.style.display="none";

snapshot.forEach((docSnap)=>{

const order=docSnap.data();
const id=docSnap.id;

currentBills[id]=order;

totalOrders++;
totalSales+=order.total||0;

let itemsHTML="";

(order.items||[]).forEach(item=>{

itemsHTML+=`
<p>🍽 ${item.qty} × ${item.name} — ₹${item.price}</p>
`;

});

const card=document.createElement("div");

card.className="bill-card";

card.dataset.phone=order.customerPhone||"";

card.innerHTML=`

<h2>📞 ${order.customerPhone}</h2>

${itemsHTML}

<div class="bill-total">
Total : ₹${order.total}
</div>

<div class="button-group">

<button class="call-btn"
onclick="callCustomer('${order.customerPhone}')">

📞 Call Customer

</button>

<button class="bill-btn"
onclick="generateBill('${id}')">

💰 Generate Bill

</button>

<button class="complete-btn"
onclick="completeOrder('${id}')">

✅ Complete Order

</button>

</div>

`;

billContainer.appendChild(card);

});

document.getElementById("todayOrders").innerText=totalOrders;
document.getElementById("todaySales").innerText="₹"+totalSales;

});

}

/* =========================
   SEARCH
========================= */

searchPhone.addEventListener("input",()=>{

const value=searchPhone.value.trim();

document.querySelectorAll(".bill-card").forEach(card=>{

card.style.display=
card.dataset.phone.includes(value)
?"block":"none";

});

});

/* =========================
   CALL CUSTOMER
========================= */

function callCustomer(phone){

window.location.href=`tel:${phone}`;

}

/* =========================
   GENERATE BILL
========================= */

function generateBill(id){

const order=currentBills[id];

if(!order)return;

let rows="";

(order.items||[]).forEach(item=>{

rows+=`

<tr>

<td>${item.name}</td>

<td>${item.qty}</td>

<td>₹${item.price}</td>

<td>₹${item.qty*item.price}</td>

</tr>

`;

});

const billNumber="RN"+Date.now().toString().slice(-6);

const token="K"+Date.now().toString().slice(-3);

const date=new Date().toLocaleString();

const gst=Math.round(order.total*0.05);

const grand=order.total+gst;

billDetails.innerHTML=`

<p><strong>Bill No:</strong> ${billNumber}</p>

<p><strong>Kitchen Token:</strong> ${token}</p>

<p><strong>Date:</strong> ${date}</p>

<p><strong>Customer:</strong> ${order.customerPhone}</p>

<table class="bill-table">

<tr>

<th>Item</th>

<th>Qty</th>

<th>Price</th>

<th>Total</th>

</tr>

${rows}

</table>

<div class="bill-summary">

<p>Subtotal : ₹${order.total}</p>

<p>GST (5%) : ₹${gst}</p>

<h3>Grand Total : ₹${grand}</h3>

</div>

`;

billPopup.classList.add("show");

}

/* =========================
   COMPLETE ORDER
========================= */

async function completeOrder(id){

const ok=confirm("Complete this order?");

if(!ok)return;

try{

await fb.deleteDoc(
fb.doc(db,"activeOrders",id)
);

billPopup.classList.remove("show");

}catch(e){

console.log(e);
alert("Unable to complete order.");

}

}

/* =========================
   BILL POPUP
========================= */

closeBill.addEventListener("click",()=>{

billPopup.classList.remove("show");

});

printBill.addEventListener("click",()=>{

window.print();

});

/* =========================
   GLOBAL
========================= */

window.callCustomer=callCustomer;
window.generateBill=generateBill;
window.completeOrder=completeOrder;

/* =========================
   START
========================= */

document.addEventListener("DOMContentLoaded",()=>{

loadBills();

});
