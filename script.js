import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─── FIREBASE INIT ────────────────────────────────────────────────────────────
const app = initializeApp({
    apiKey: "AIzaSyBowvP1x1od-RijlwT3gAoTzq5yiZ-faz4",
    authDomain: "nepsetracker1.firebaseapp.com",
    projectId: "nepsetracker1",
    storageBucket: "nepsetracker1.firebasestorage.app",
    messagingSenderId: "180767710295",
    appId: "1:180767710295:web:71b87c8ae7cec69eb5d712"
});
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

// ─── STATE ────────────────────────────────────────────────────────────────────
let stocks = [], history = [], currentUser = null;
const BACKEND_URL = "https://nepse-live-backend-1.onrender.com";

// ─── DOM HELPERS ──────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);

// ─── CLOUD SYNC ───────────────────────────────────────────────────────────────
async function saveToCloud() {
    if (!currentUser) return;
    try {
        await setDoc(doc(db, "users", currentUser.uid), { stocks, history });
    } catch (e) { console.error("Cloud save failed:", e); }
}

// ─── STATUS BAR ───────────────────────────────────────────────────────────────
function setStatus(msg, type = 'live') {
    const tag = $("lastUpdated");
    if (!tag) return;
    tag.innerText   = msg;
    tag.style.color = type === 'warn' ? '#f0b90b' : '#23d160';
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
window.handleLogin  = () => signInWithPopup(auth, provider).catch(e => {
    console.error(e); alert("Login failed. Check popup settings.");
});
window.handleLogout = () => signOut(auth).then(() => { stocks = []; window.location.reload(); });

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        if ($("login-btn")) $("login-btn").style.display = "none";
        if ($("user-info")) $("user-info").style.display = "flex";
        if ($("user-name")) $("user-name").innerText = user.displayName;
        if ($("user-pic"))  $("user-pic").src = user.photoURL;

        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
            const data = snap.data();
            stocks  = data.stocks  || [];
            history = data.history || [];
            // Show cached data instantly so dashboard is usable right away
            displayStocks();
            displayHistory();
            setStatus("⚠ Showing cached prices · Syncing live...", "warn");
            fetchAllLTPs();
        }
    } else {
        currentUser = null;
        if ($("login-btn")) $("login-btn").style.display = "block";
        if ($("user-info")) $("user-info").style.display = "none";
        stocks = []; history = [];
    }
});

// ─── NEPSE COST ENGINE ────────────────────────────────────────────────────────

/**
 * Returns the standard NEPSE broker commission rate for a given sell amount.
 *
 * Tiered schedule (SEBON-approved):
 *   ≤    50,000  →  0.40%
 *   ≤   500,000  →  0.37%
 *   ≤ 2,000,000  →  0.34%
 *   ≤10,000,000  →  0.30%
 *   >10,000,000  →  0.27%
 */
function getBrokerRate(amount) {
    if (amount <=    50_000) return 0.0040;
    if (amount <=   500_000) return 0.0037;
    if (amount <= 2_000_000) return 0.0034;
    if (amount <= 10_000_000) return 0.0030;
    return 0.0027;
}

/**
 * Calculates the full NEPSE sell cost breakdown and net P/L.
 *
 * Costs deducted from seller:
 *   1. SEBON Commission  — 0.015% of total sell amount
 *   2. Broker Commission — tiered rate (0.40% → 0.27%) on total sell amount
 *   3. DP Fee            — flat Rs. 25 per company per sale
 *   4. CGT               — 5% (long-term >1yr) or 7.5% (short-term) on NET profit only
 *
 * @param {number}  buyPrice   - WACC per share
 * @param {number}  sellPrice  - Sell price per share
 * @param {number}  quantity   - Shares sold
 * @param {boolean} isLongTerm - true = >365 days holding → 5% CGT, false → 7.5%
 */
function calcNepseSell(buyPrice, sellPrice, quantity, isLongTerm = true) {
    const totalBuyAmount  = buyPrice  * quantity;
    const totalSellAmount = sellPrice * quantity;

    const sebonFee  = totalSellAmount * 0.00015;                           // 0.015%
    const brokerFee = totalSellAmount * getBrokerRate(totalSellAmount);    // tiered
    const dpFee     = 25;                                                  // fixed

    // Gross profit before CGT
    const grossProfit = totalSellAmount - totalBuyAmount - sebonFee - brokerFee - dpFee;

    // CGT: only on profit, never on a loss
    const cgtRate = isLongTerm ? 0.05 : 0.075;
    const cgt     = grossProfit > 0 ? grossProfit * cgtRate : 0;

    const totalDeductions = sebonFee + brokerFee + dpFee + cgt;
    const netReceiveAmount = totalSellAmount - totalDeductions;
    const netPL            = netReceiveAmount - totalBuyAmount;
    const netPLPercent     = totalBuyAmount > 0 ? (netPL / totalBuyAmount) * 100 : 0;

    return {
        totalBuyAmount:   +totalBuyAmount.toFixed(2),
        totalSellAmount:  +totalSellAmount.toFixed(2),
        sebonFee:         +sebonFee.toFixed(2),
        brokerFee:        +brokerFee.toFixed(2),
        dpFee,
        cgt:              +cgt.toFixed(2),
        cgtRate,
        totalDeductions:  +totalDeductions.toFixed(2),
        netReceiveAmount: +netReceiveAmount.toFixed(2),
        netPL:            +netPL.toFixed(2),
        netPLPercent:     +netPLPercent.toFixed(2),
    };
}

// ─── PORTFOLIO FUNCTIONS ──────────────────────────────────────────────────────
window.addStock = async () => {
    const name = $("stockName").value.toUpperCase().trim();
    const qty  = parseFloat($("quantity").value);
    const wacc = parseFloat($("wacc").value);

    if (!currentUser)                      return alert("Please login with Google first!");
    if (!name || isNaN(qty) || isNaN(wacc)) return alert("Please fill all fields correctly!");

    stocks.push({ name, quantity: qty, wacc, ltp: 0, target: 0, stopLoss: 0, targetHit: false, slHit: false });
    $("stockName").value = $("quantity").value = $("wacc").value = "";

    displayStocks();
    await saveToCloud();
    fetchAllLTPs();
};

window.deleteStock = async (i) => {
    if (!confirm("Permanently delete this stock?")) return;
    stocks.splice(i, 1);
    displayStocks();
    await saveToCloud();
};

let currentSellIndex = null; // Track which stock is being sold

window.sellStock = (i) => {
    currentSellIndex = i;
    const stock = stocks[i];
    
    // Fill the Modal with the stock data
    document.getElementById("sellModalTitle").innerText = `Sell ${stock.name}`;
    document.getElementById("maxQty").innerText = stock.quantity;
    document.getElementById("modalSellQty").value = stock.quantity;
    document.getElementById("modalSellPrice").value = stock.ltp || 0;
    
    // Show the Modal
    document.getElementById("sellModal").style.display = "flex";
    
    // Run initial calculation
    calculateSellPreview();
};

// This function runs every time you type in the Modal
window.calculateSellPreview = () => {
    const stock = stocks[currentSellIndex];
    const qty = parseFloat(document.getElementById("modalSellQty").value) || 0;
    const price = parseFloat(document.getElementById("modalSellPrice").value) || 0;
    const isLongTerm = document.getElementById("modalHoldingPeriod").value === "long";

    // Use your math helper (Ensure calcNepseSell is defined in your script!)
    const c = calcNepseSell(stock.wacc, price, qty, isLongTerm);

    // Update the Modal's calculation rows
    document.getElementById("sCalcAmount").innerText = `Rs. ${c.totalSellAmount.toLocaleString()}`;
    document.getElementById("sCalcBroker").innerText = `-Rs. ${c.brokerFee.toFixed(2)}`;
    document.getElementById("sCalcSebon").innerText = `-Rs. ${c.sebonFee.toFixed(2)}`;
    document.getElementById("sCalcCGT").innerText = `-Rs. ${c.cgt.toFixed(2)}`;
    document.getElementById("sCalcNet").innerText = `Rs. ${c.netReceiveAmount.toLocaleString()}`;
    
    const plEl = document.getElementById("sCalcPL");
    plEl.innerText = `Rs. ${c.netPL.toLocaleString()}`;
    plEl.className = `calc-row ${c.netPL >= 0 ? "profit" : "loss"}`;

    // Update the Confirm button to finalize this specific sale
    document.getElementById("confirmSellBtn").onclick = () => finalizeSell(qty, price, isLongTerm, c);
};

async function finalizeSell(qty, price, isLongTerm, c) {
    const stock = stocks[currentSellIndex];
    
    if (qty > stock.quantity) return alert("Quantity exceeds balance!");

    const soldData = {
        name: stock.name,
        quantity: qty,
        buyPrice: stock.wacc,
        sellPrice: price,
        pl: c.netPL,
        date: new Date().toLocaleDateString()
    };

    history.push(soldData);

    if (qty === stock.quantity) {
        stocks.splice(currentSellIndex, 1);
    } else {
        stock.quantity -= qty;
    }

    displayStocks();
    displayHistory();
    await saveToCloud();
    closeSellModal();
}

window.closeSellModal = () => {
    document.getElementById("sellModal").style.display = "none";
};
window.updateStock = async (i, field, value) => {
    const val = parseFloat(value);
    if (!isNaN(val)) {
        stocks[i][field] = val;
        await saveToCloud();
        displayStocks();
    }
};

window.rollbackSale = async (i) => {
    if (!confirm("Restore this stock to your active portfolio?")) return;
    const sold = history[i];
    if (!sold) return;

    stocks.push({
        name: sold.name, quantity: sold.quantity,
        wacc: sold.buyPrice, ltp: sold.sellPrice,
        target: 0, stopLoss: 0, targetHit: false, slHit: false
    });
    history.splice(i, 1);

    displayStocks();
    displayHistory();
    await saveToCloud();
    alert("Stock restored to active portfolio!");
};

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────
window.switchTab = (tab) => {
    const isPortfolio = tab === 'portfolio';
    const pView = $('portfolio-view'), hView = $('history-view');
    const pTab  = $('tab-portfolio'),  hTab  = $('tab-history');
    if (!pView || !hView) return;

    pView.style.display = isPortfolio ? 'block' : 'none';
    hView.style.display = isPortfolio ? 'none'  : 'block';
    pTab?.classList.toggle('active',  isPortfolio);
    hTab?.classList.toggle('active', !isPortfolio);

    if (!isPortfolio) displayHistory();
};

window.sortStocks = (field) => {
    if (field === 'name')
        stocks.sort((a, b) => a.name.localeCompare(b.name));
    else if (field === 'profitLoss')
        stocks.sort((a, b) => ((b.ltp - b.wacc) * b.quantity) - ((a.ltp - a.wacc) * a.quantity));
    displayStocks();
};

// ─── UI RENDERING ─────────────────────────────────────────────────────────────
function displayStocks() {
    const list = $("stockList");
    if (!list) return;

    let totalVal = 0, totalInv = 0;

    // Build all rows as a string and set once — avoids repeated reflows
    list.innerHTML = stocks.map((s, i) => {
        const amount = s.ltp   * s.quantity;
        const invest = s.wacc  * s.quantity;
        const pl     = amount  - invest;
        const plPct  = invest > 0 ? (pl / invest) * 100 : 0;
        totalVal += amount;
        totalInv += invest;
        const cls = pl >= 0 ? 'profit' : 'loss';
        return `<tr>
            <td>${s.name}</td>
            <td contenteditable="true" onblur="updateStock(${i},'quantity',this.innerText)">${s.quantity}</td>
            <td contenteditable="true" onblur="updateStock(${i},'wacc',this.innerText)">${s.wacc}</td>
            <td class="ltp-cell">${s.ltp.toFixed(2)}</td>
            <td>${amount.toFixed(2)}</td>
            <td contenteditable="true" onblur="updateStock(${i},'target',this.innerText)">${s.target || 0}</td>
            <td contenteditable="true" onblur="updateStock(${i},'stopLoss',this.innerText)">${s.stopLoss || 0}</td>
            <td class="${cls}">${pl.toFixed(2)}</td>
            <td class="${cls}">${plPct.toFixed(2)}%</td>
            <td>
                <button onclick="sellStock(${i})" class="btn-sell">Sell</button>
                <button onclick="deleteStock(${i})" class="btn-danger">✕</button>
            </td>
        </tr>`;
    }).join('');

    updateDashboard(totalInv, totalVal);
}

function displayHistory() {
    const hList = $("historyList");
    if (!hList) return;

    let totalNetPL = 0;

    hList.innerHTML = history.map((item, i) => {
        totalNetPL += item.pl;
        const cls = item.pl >= 0 ? 'profit' : 'loss';
        const plSign = item.pl >= 0 ? '+' : '';
        // Gracefully handle legacy records without the new cost fields
        const hasBreakdown = item.netReceiveAmount !== undefined;
        const costTip = hasBreakdown
            ? `title="SEBON: Rs.${item.sebonFee} | Broker: Rs.${item.brokerFee} | DP: Rs.${item.dpFee} | CGT: Rs.${item.cgt}"`
            : '';

        return `<tr>
            <td><strong>${item.name}</strong></td>
            <td>${item.quantity}</td>
            <td>Rs. ${item.buyPrice.toFixed(2)}</td>
            <td>Rs. ${item.sellPrice.toFixed(2)}</td>
            <td>${hasBreakdown ? `Rs. ${item.netReceiveAmount.toLocaleString()}` : '—'}</td>
            <td class="${cls}">${plSign}Rs. ${item.pl.toFixed(2)}</td>
            <td class="${cls}">${item.netPLPercent !== undefined ? plSign + item.netPLPercent.toFixed(2) + '%' : '—'}</td>
            <td>${hasBreakdown ? `<span class="cost-tip" ${costTip}>ⓘ Costs</span>` : '—'}</td>
            <td>${item.date}</td>
            <td><button onclick="rollbackSale(${i})" class="btn-rollback">Undo</button></td>
        </tr>`;
    }).join('');

    const realizedEl = $("realizedPL");
    if (realizedEl) {
        const sign = totalNetPL >= 0 ? '+' : '';
        realizedEl.textContent = `${sign}Rs. ${totalNetPL.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        realizedEl.className   = `value ${totalNetPL >= 0 ? 'profit' : 'loss'}`;
    }
}

function updateDashboard(inv, val) {
    const pl = val - inv;
    if ($("currentInvestment")) $("currentInvestment").textContent = inv.toLocaleString();
    if ($("currentValue"))      $("currentValue").textContent      = val.toLocaleString();
    if ($("totalProfitLoss")) {
        $("totalProfitLoss").textContent = pl.toLocaleString();
        $("totalProfitLoss").className   = `value ${pl >= 0 ? 'profit' : 'loss'}`;
    }
}

// ─── LTP FETCHING ─────────────────────────────────────────────────────────────
async function fetchAllLTPs() {
    if (!stocks.length) return;
    setStatus("⟳ Syncing live prices...", "warn");

    // Fetch all LTPs in parallel instead of sequentially — much faster
    await Promise.all(stocks.map(async (stock, i) => {
        try {
            const resp = await fetch(`${BACKEND_URL}/api/ltp?symbol=${stock.name}`);
            if (!resp.ok) return;
            const newLtp = Number((await resp.json()).ltp) || 0;

            // Target hit alert (one-time)
            if (stock.target > 0 && newLtp >= stock.target && !stock.targetHit) {
                triggerAlert(`🎯 TARGET HIT: ${stock.name} at Rs. ${newLtp}`);
                stock.targetHit = true;
            } else if (newLtp < stock.target) {
                stock.targetHit = false;
            }

            // Stop-loss alert (one-time)
            if (stock.stopLoss > 0 && newLtp <= stock.stopLoss && !stock.slHit) {
                triggerAlert(`⚠️ STOP LOSS: ${stock.name} dropped to Rs. ${newLtp}`);
                stock.slHit = true;
            } else if (newLtp > stock.stopLoss) {
                stock.slHit = false;
            }

            stocks[i].ltp = newLtp;
        } catch (e) { console.error(`LTP fetch failed for ${stock.name}:`, e); }
    }));

    displayStocks();
    // Always persist latest LTPs so next refresh shows correct Current Value instantly
    await saveToCloud();
    setStatus(`✓ Live · Last sync: ${new Date().toLocaleTimeString()}`);
}

function triggerAlert(message) {
    alert(message);
    if (Notification.permission === "granted")
        new Notification("NEPSE Alert", { body: message });
}

if (window.Notification && Notification.permission !== "granted")
    Notification.requestPermission();

setInterval(fetchAllLTPs, 60000);