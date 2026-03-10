import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- YOUR FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyBowvP1x1od-RijlwT3gAoTzq5yiZ-faz4",
  authDomain: "nepsetracker1.firebaseapp.com",
  projectId: "nepsetracker1",
  storageBucket: "nepsetracker1.firebasestorage.app",
  messagingSenderId: "180767710295",
  appId: "1:180767710295:web:71b87c8ae7cec69eb5d712",
  measurementId: "G-L7GT9WQNED"
};

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let stocks = [];
let currentUser = null;
const BACKEND_URL = "https://nepse-live-backend-1.onrender.com";

// --- CLOUD SYNC HELPERS ---
async function saveToCloud() {
    if (currentUser) {
        try {
            await setDoc(doc(db, "users", currentUser.uid), { stocks: stocks, history: history });
        } catch (e) { console.error("Cloud Save Failed:", e); }
    }
}

// --- AUTH FUNCTIONS ---
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
        if(loginBtn) loginBtn.style.display = "none";
        if(userInfo) userInfo.style.display = "flex";
        document.getElementById("user-name").innerText = user.displayName;
        document.getElementById("user-pic").src = user.photoURL;
        
        // Load existing cloud data
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
            stocks = docSnap.data().stocks || [];
            displayStocks();
            fetchAllLTPs();
        }
    } else {
        currentUser = null;
        if(loginBtn) loginBtn.style.display = "block";
        if(userInfo) userInfo.style.display = "none";
    }
});

// --- CORE PORTFOLIO FUNCTIONS ---
window.addStock = async () => {
    const nameInput = document.getElementById("stockName");
    const qtyInput = document.getElementById("quantity");
    const waccInput = document.getElementById("wacc");

    const name = nameInput.value.toUpperCase().trim();
    const qty = parseFloat(qtyInput.value);
    const wacc = parseFloat(waccInput.value);

    if (!currentUser) return alert("Please Login with Google first!");
    if (!name || isNaN(qty) || isNaN(wacc)) return alert("Please fill all fields correctly!");

    stocks.push({ name, quantity: qty, wacc, ltp: 0, target: 0, stopLoss: 0 });
    
    // Clear inputs
    nameInput.value = ""; qtyInput.value = ""; waccInput.value = "";
    
    displayStocks();
    await saveToCloud();
    fetchAllLTPs();
};

window.deleteStock = async (i) => {
    if(confirm("Permanently delete this from cloud?")) {
        stocks.splice(i, 1);
        displayStocks();
        await saveToCloud();
    }
};
window.sellStock = async (i) => {
    const stock = stocks[i];
    
    // 1. Ask for Sell Price
    const sellPrice = prompt(`Enter Selling Price for ${stock.name}:`, stock.ltp);
    
    // 2. Validate input
    if (sellPrice === null || isNaN(sellPrice) || sellPrice <= 0) return;

    // 3. Create the History Object
    const soldData = {
        name: stock.name,
        quantity: stock.quantity,
        buyPrice: stock.wacc,
        sellPrice: parseFloat(sellPrice),
        pl: (parseFloat(sellPrice) - stock.wacc) * stock.quantity,
        date: new Date().toLocaleDateString()
    };

    // 4. Move data
    history.push(soldData); // Add to history array
    stocks.splice(i, 1);    // Remove from active array

    // 5. Refresh UI and Sync Cloud
    displayStocks();
    if (document.getElementById('history-view').style.display === 'block') {
        displayHistory();
    }
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

// --- UI & DATA FETCHING ---
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

        const row = `<tr>
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
        stockList.innerHTML += row;
    });
    updateDashboard(totalInv, totalVal);
}
function displayHistory() {
    const hList = document.getElementById("historyList");
    if (!hList) return;
    
    hList.innerHTML = "";
    let totalRealizedPL = 0;

    history.forEach(item => {
        totalRealizedPL += item.pl;
        const row = `
            <tr>
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${item.buyPrice.toFixed(2)}</td>
                <td>${item.sellPrice.toFixed(2)}</td>
                <td class="${item.pl >= 0 ? 'profit' : 'loss'}">${item.pl.toFixed(2)}</td>
                <td>${item.date}</td>
            </tr>`;
        hList.innerHTML += row;
    });

    // Optional: Log total realized profit to console for now
    console.log("Total Realized P/L: ", totalRealizedPL);
}

function updateDashboard(inv, val) {
    const invEl = document.getElementById("currentInvestment");
    const valEl = document.getElementById("currentValue");
    const plEl = document.getElementById("totalProfitLoss");

    if(invEl) invEl.textContent = inv.toLocaleString();
    if(valEl) valEl.textContent = val.toLocaleString();
    
    const pl = val - inv;
    if(plEl) {
        plEl.textContent = pl.toLocaleString();
        plEl.className = `value ${pl >= 0 ? 'profit' : 'loss'}`;
    }
}

async function fetchAllLTPs() {
    if (!stocks.length) return;
    const statusTag = document.getElementById("lastUpdated");
    if(statusTag) statusTag.innerText = "Syncing...";

    for (let i = 0; i < stocks.length; i++) {
        try {
            const resp = await fetch(`${BACKEND_URL}/api/ltp?symbol=${stocks[i].name}`);
            if (resp.ok) {
                const data = await resp.json();
                const newLtp = Number(data.ltp) || 0;
                
                // --- Notification Logic ---
                // Only alert if Target or Stop Loss is set (not 0)
                if (stocks[i].target > 0 && newLtp >= stocks[i].target) {
                    triggerAlert(`🎯 TARGET REACHED: ${stocks[i].name} is at ${newLtp}`);
                } 
                else if (stocks[i].stopLoss > 0 && newLtp <= stocks[i].stopLoss) {
                    triggerAlert(`⚠️ STOP LOSS HIT: ${stocks[i].name} dropped to ${newLtp}`);
                }
                
                stocks[i].ltp = newLtp;
            }
        } catch (e) { console.error("Fetch error for " + stocks[i].name, e); }
    }
    displayStocks();
    if(statusTag) statusTag.innerText = `Last Sync: ${new Date().toLocaleTimeString()}`;
}

// Helper function to handle the alert
function triggerAlert(message) {
    // 1. Show a browser popup
    alert(message);
    
    // 2. Use the Web Notification API (for desktop bubbles)
    if (Notification.permission === "granted") {
        new Notification("NEPSE Portfolio Alert", { body: message });
    }
}
// Request notification permission on page load
if (window.Notification && Notification.permission !== "granted") {
    Notification.requestPermission();
}
// Update every 60 seconds
setInterval(fetchAllLTPs, 60000);
