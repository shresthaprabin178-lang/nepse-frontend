import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBowvP1x1od-RijlwT3gAoTzq5yiZ-faz4",
  authDomain: "nepsetracker1.firebaseapp.com",
  projectId: "nepsetracker1",
  storageBucket: "nepsetracker1.firebasestorage.app",
  messagingSenderId: "180767710295",
  appId: "1:180767710295:web:71b87c8ae7cec69eb5d712",
  measurementId: "G-L7GT9WQNED"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let stocks = [];
let history = [];
let currentUser = null;
const BACKEND_URL = "https://nepse-live-backend-1.onrender.com";

// --- CLOUD SYNC ---
async function saveToCloud() {
    if (currentUser) {
        try {
            await setDoc(doc(db, "users", currentUser.uid), { stocks, history });
        } catch (e) { console.error("Cloud Save Failed:", e); }
    }
}

// --- AUTH ---
window.handleLogin = async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (e) {
        console.error("Login Error:", e);
        alert("Login failed. Check your Firebase popup settings.");
    }
};

window.handleLogout = () => {
    signOut(auth).then(() => {
        stocks = [];
        window.location.reload();
    });
};

onAuthStateChanged(auth, async (user) => {
    const loginBtn = document.getElementById("login-btn");
    const userInfo = document.getElementById("user-info");

    if (user) {
        currentUser = user;
        if (loginBtn) loginBtn.style.display = "none";
        if (userInfo) userInfo.style.display = "flex";
        document.getElementById("user-name").innerText = user.displayName;
        document.getElementById("user-pic").src = user.photoURL;

        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
            const data = docSnap.data();
            stocks = data.stocks || [];
            history = data.history || [];
            displayStocks();
            displayHistory();
            fetchAllLTPs();
        }
    } else {
        currentUser = null;
        if (loginBtn) loginBtn.style.display = "block";
        if (userInfo) userInfo.style.display = "none";
        stocks = [];
        history = [];
    }
});

// --- PORTFOLIO FUNCTIONS ---
window.addStock = async () => {
    const nameInput = document.getElementById("stockName");
    const qtyInput = document.getElementById("quantity");
    const waccInput = document.getElementById("wacc");

    const name = nameInput.value.toUpperCase().trim();
    const qty = parseFloat(qtyInput.value);
    const wacc = parseFloat(waccInput.value);

    if (!currentUser) return alert("Please Login with Google first!");
    if (!name || isNaN(qty) || isNaN(wacc)) return alert("Please fill all fields correctly!");

    stocks.push({
        name, quantity: qty, wacc, ltp: 0,
        target: 0, stopLoss: 0,
        targetHit: false, slHit: false
    });

    nameInput.value = ""; qtyInput.value = ""; waccInput.value = "";

    displayStocks();
    await saveToCloud();
    fetchAllLTPs();
};

window.deleteStock = async (i) => {
    if (confirm("Permanently delete this from cloud?")) {
        stocks.splice(i, 1);
        displayStocks();
        await saveToCloud();
    }
};

window.sellStock = async (i) => {
    const stock = stocks[i];
    const sellPrice = prompt(`Enter Selling Price for ${stock.name}:`, stock.ltp);
    if (sellPrice === null || isNaN(sellPrice) || parseFloat(sellPrice) <= 0) return;

    const soldData = {
        name: stock.name,
        quantity: stock.quantity,
        buyPrice: stock.wacc,
        sellPrice: parseFloat(sellPrice),
        pl: (parseFloat(sellPrice) - stock.wacc) * stock.quantity,
        date: new Date().toLocaleDateString()
    };

    history.push(soldData);
    stocks.splice(i, 1);

    displayStocks();
    displayHistory();
    await saveToCloud();
    alert(`Sold ${stock.name} successfully! Check 'Trade History' tab.`);
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
    if (!confirm("Move this stock back to your active portfolio?")) return;

    const soldItem = history[i];
    if (!soldItem) return;

    stocks.push({
        name: soldItem.name,
        quantity: soldItem.quantity,
        wacc: soldItem.buyPrice,
        ltp: soldItem.sellPrice,
        target: 0,
        stopLoss: 0,
        targetHit: false,
        slHit: false
    });

    history.splice(i, 1);

    displayStocks();
    displayHistory();
    await saveToCloud();
    alert("Stock restored to active portfolio!");
};

// --- TAB SWITCHING ---
window.switchTab = (tab) => {
    const pView = document.getElementById('portfolio-view');
    const hView = document.getElementById('history-view');
    const pTab = document.getElementById('tab-portfolio');
    const hTab = document.getElementById('tab-history');

    if (!pView || !hView) return;

    if (tab === 'portfolio') {
        pView.style.display = 'block';
        hView.style.display = 'none';
        if (pTab) pTab.classList.add('active');
        if (hTab) hTab.classList.remove('active');
    } else {
        pView.style.display = 'none';
        hView.style.display = 'block';
        if (hTab) hTab.classList.add('active');
        if (pTab) pTab.classList.remove('active');
        displayHistory();
    }
};

window.sortStocks = (field) => {
    if (field === 'name') stocks.sort((a, b) => a.name.localeCompare(b.name));
    else if (field === 'profitLoss') {
        stocks.sort((a, b) => {
            const plA = (a.ltp - a.wacc) * a.quantity;
            const plB = (b.ltp - b.wacc) * b.quantity;
            return plB - plA;
        });
    }
    displayStocks();
};

// --- UI RENDERING ---
function displayStocks() {
    const stockList = document.getElementById("stockList");
    if (!stockList) return;
    stockList.innerHTML = "";

    let totalVal = 0, totalInv = 0;

    stocks.forEach((stock, i) => {
        const amount = stock.ltp * stock.quantity;
        const investment = stock.wacc * stock.quantity;
        const pl = amount - investment;
        const plPercent = investment > 0 ? (pl / investment) * 100 : 0;

        totalVal += amount;
        totalInv += investment;

        stockList.innerHTML += `<tr>
            <td>${stock.name}</td>
            <td contenteditable="true" onblur="updateStock(${i}, 'quantity', this.innerText)">${stock.quantity}</td>
            <td contenteditable="true" onblur="updateStock(${i}, 'wacc', this.innerText)">${stock.wacc}</td>
            <td class="ltp-cell">${stock.ltp.toFixed(2)}</td>
            <td>${amount.toFixed(2)}</td>
            <td contenteditable="true" onblur="updateStock(${i}, 'target', this.innerText)">${stock.target || 0}</td>
            <td contenteditable="true" onblur="updateStock(${i}, 'stopLoss', this.innerText)">${stock.stopLoss || 0}</td>
            <td class="${pl >= 0 ? 'profit' : 'loss'}">${pl.toFixed(2)}</td>
            <td class="${pl >= 0 ? 'profit' : 'loss'}">${plPercent.toFixed(2)}%</td>
            <td>
                <button onclick="sellStock(${i})" class="btn-sell">Sell</button>
                <button onclick="deleteStock(${i})" class="btn-danger">✕</button>
            </td>
        </tr>`;
    });

    updateDashboard(totalInv, totalVal);
}

// ✅ FIX: Corrected forEach syntax — was missing opening parenthesis
function displayHistory() {
    const hList = document.getElementById("historyList");
    if (!hList) return;

    hList.innerHTML = "";
    let totalRealizedPL = 0;

    history.forEach((item, i) => {
        totalRealizedPL += item.pl;
        const plClass = item.pl >= 0 ? 'profit' : 'loss';
        hList.innerHTML += `<tr>
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${item.buyPrice.toFixed(2)}</td>
            <td>${item.sellPrice.toFixed(2)}</td>
            <td class="${plClass}">${item.pl.toFixed(2)}</td>
            <td>${item.date}</td>
            <td><button onclick="rollbackSale(${i})" class="btn-rollback">Undo</button></td>
        </tr>`;
    });

    // Update realized P/L summary card if it exists
    const realizedEl = document.getElementById("realizedPL");
    if (realizedEl) {
        realizedEl.textContent = totalRealizedPL.toLocaleString(undefined, { minimumFractionDigits: 2 });
        realizedEl.className = `value ${totalRealizedPL >= 0 ? 'profit' : 'loss'}`;
    }
}

function updateDashboard(inv, val) {
    const invEl = document.getElementById("currentInvestment");
    const valEl = document.getElementById("currentValue");
    const plEl = document.getElementById("totalProfitLoss");

    if (invEl) invEl.textContent = inv.toLocaleString();
    if (valEl) valEl.textContent = val.toLocaleString();

    const pl = val - inv;
    if (plEl) {
        plEl.textContent = pl.toLocaleString();
        plEl.className = `value ${pl >= 0 ? 'profit' : 'loss'}`;
    }
}

// --- LTP FETCHING ---
async function fetchAllLTPs() {
    if (!stocks.length) return;
    const statusTag = document.getElementById("lastUpdated");
    if (statusTag) statusTag.innerText = "Syncing...";

    for (let i = 0; i < stocks.length; i++) {
        try {
            const resp = await fetch(`${BACKEND_URL}/api/ltp?symbol=${stocks[i].name}`);
            if (resp.ok) {
                const data = await resp.json();
                const newLtp = Number(data.ltp) || 0;
                const stock = stocks[i];

                if (stock.target > 0 && newLtp >= stock.target) {
                    if (!stock.targetHit) {
                        triggerAlert(`🎯 TARGET REACHED: ${stock.name} is at ${newLtp}`);
                        stock.targetHit = true;
                        await saveToCloud();
                    }
                } else if (newLtp < stock.target) {
                    stock.targetHit = false;
                }

                if (stock.stopLoss > 0 && newLtp <= stock.stopLoss) {
                    if (!stock.slHit) {
                        triggerAlert(`⚠️ STOP LOSS HIT: ${stock.name} dropped to ${newLtp}`);
                        stock.slHit = true;
                        await saveToCloud();
                    }
                } else if (newLtp > stock.stopLoss) {
                    stock.slHit = false;
                }

                stocks[i].ltp = newLtp;
            }
        } catch (e) { console.error("Fetch error for " + stocks[i].name, e); }
    }

    displayStocks();
    if (statusTag) statusTag.innerText = `Last Sync: ${new Date().toLocaleTimeString()}`;
}

function triggerAlert(message) {
    alert(message);
    if (Notification.permission === "granted") {
        new Notification("NEPSE Portfolio Alert", { body: message });
    }
}

if (window.Notification && Notification.permission !== "granted") {
    Notification.requestPermission();
}

setInterval(fetchAllLTPs, 60000);