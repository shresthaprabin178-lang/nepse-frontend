let stocks = JSON.parse(localStorage.getItem('stocks')) || [];
const BACKEND_URL = "https://nepse-live-backend-1.onrender.com";

// Request Notifications
if (Notification.permission !== "granted") {
    Notification.requestPermission();
}

function saveStocks() {
    localStorage.setItem('stocks', JSON.stringify(stocks));
}

function showNotification(title, message) {
    if (Notification.permission === "granted") {
        new Notification(title, { 
            body: message, 
            icon: "https://upload.wikimedia.org/wikipedia/commons/7/7e/NEPSE_Logo.png" 
        });
    }
}

function addStock() {
    let name = document.getElementById("stockName").value.toUpperCase().trim();
    const quantity = parseFloat(document.getElementById("quantity").value);
    const wacc = parseFloat(document.getElementById("wacc").value);

    if (!name || isNaN(quantity) || quantity <= 0 || isNaN(wacc) || wacc <= 0) {
        alert("Enter valid symbol, quantity & WACC");
        return;
    }

    stocks.push({ 
        name, quantity, wacc, 
        target: 0, stopLoss: 0, ltp: 0, 
        targetNotified: false, stopNotified: false 
    });
    
    document.getElementById("stockName").value = "";
    document.getElementById("quantity").value = "";
    document.getElementById("wacc").value = "";
    
    displayStocks();
    saveStocks();
    fetchAllLTPs(); // Immediate update for new stock
}

function displayStocks() {
    const stockList = document.getElementById("stockList");
    stockList.innerHTML = "";

    let totalVal = 0, totalInv = 0;

    stocks.forEach((stock, i) => {
        const amount = stock.ltp * stock.quantity;
        const investment = stock.wacc * stock.quantity;
        const pl = amount - investment;
        const plPercent = investment > 0 ? (pl / investment) * 100 : 0;

        totalVal += amount;
        totalInv += investment;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${stock.name}</td>
            <td contenteditable="true" onblur="updateStock(${i}, 'quantity', this.textContent)">${stock.quantity}</td>
            <td contenteditable="true" onblur="updateStock(${i}, 'wacc', this.textContent)">${stock.wacc}</td>
            <td class="ltp-cell">${stock.ltp.toFixed(2)}</td>
            <td>${amount.toFixed(2)}</td>
            <td contenteditable="true" onblur="updateStock(${i}, 'target', this.textContent)">${stock.target || 0}</td>
            <td contenteditable="true" onblur="updateStock(${i}, 'stopLoss', this.textContent)">${stock.stopLoss || 0}</td>
            <td class="${pl >= 0 ? 'profit' : 'loss'}">${pl.toFixed(2)}</td>
            <td class="${pl >= 0 ? 'profit' : 'loss'}">${plPercent.toFixed(2)}%</td>
            <td><button class="delete-btn" style="background:none; border:none; color:#848e9c; cursor:pointer;" onclick="deleteStock(${i})">✕</button></td>
        `;
        stockList.appendChild(row);
    });

    updateDashboard(totalInv, totalVal);
}

function updateDashboard(inv, val) {
    const pl = val - inv;
    const plPercent = inv > 0 ? (pl / inv) * 100 : 0;

    document.getElementById("currentInvestment").textContent = inv.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById("currentValue").textContent = val.toLocaleString(undefined, {minimumFractionDigits: 2});
    
    const plElement = document.getElementById("totalProfitLoss");
    const plPercentElement = document.getElementById("totalPLPercent");
    
    plElement.textContent = pl.toLocaleString(undefined, {minimumFractionDigits: 2});
    plPercentElement.textContent = `${pl >= 0 ? '+' : ''}${plPercent.toFixed(2)}%`;
    
    plElement.className = `value ${pl >= 0 ? 'profit' : 'loss'}`;
    plPercentElement.className = `sub-value ${pl >= 0 ? 'profit' : 'loss'}`;
}

async function fetchAllLTPs() {
    if (!stocks.length) return;

    for (let i = 0; i < stocks.length; i++) {
        const symbol = stocks[i].name;
        try {
            const resp = await fetch(`${BACKEND_URL}/api/ltp?symbol=${symbol}`);
            if (!resp.ok) continue;
            const data = await resp.json();
            const newLtp = Number(data.ltp) || 0;
            
            if(newLtp !== stocks[i].ltp) {
                stocks[i].ltp = newLtp;
                checkAlerts(stocks[i]);
                triggerFlash(i);
            }
        } catch (err) {
            console.error("Error fetching LTP for", symbol);
        }
    }
    displayStocks();
    saveStocks();
    document.getElementById("lastUpdated").innerText = `Last Sync: ${new Date().toLocaleTimeString()}`;
}

function checkAlerts(stock) {
    if (stock.target > 0 && stock.ltp >= stock.target && !stock.targetNotified) {
        showNotification(`🎯 Target: ${stock.name}`, `${stock.name} hit ${stock.ltp}`);
        stock.targetNotified = true;
    }
    if (stock.stopLoss > 0 && stock.ltp <= stock.stopLoss && !stock.stopNotified) {
        showNotification(`⚠️ Stop Loss: ${stock.name}`, `${stock.name} dropped to ${stock.ltp}`);
        stock.stopNotified = true;
    }
}

function triggerFlash(index) {
    const rows = document.getElementById("stockList").children;
    if(rows[index]) {
        rows[index].classList.add('flash-update');
        setTimeout(() => rows[index].classList.remove('flash-update'), 1500);
    }
}

function updateStock(i, field, value) {
    const val = parseFloat(value);
    if (isNaN(val)) return;
    if (field === 'target' || field === 'stopLoss') {
        stocks[i].targetNotified = false;
        stocks[i].stopNotified = false;
    }
    stocks[i][field] = val;
    saveStocks();
    displayStocks();
}

function deleteStock(i) {
    if(confirm("Delete this asset?")) {
        stocks.splice(i, 1);
        displayStocks();
        saveStocks();
    }
}

function sortStocks(field) {
    if (field === 'name') stocks.sort((a, b) => a.name.localeCompare(b.name));
    else if (field === 'profitLoss') stocks.sort((a, b) => ((b.ltp - b.wacc) * b.quantity) - ((a.ltp - a.wacc) * a.quantity));
    displayStocks();
}

function clearCache() {
    if (confirm("Reset entire portfolio?")) {
        localStorage.removeItem('stocks');
        stocks = [];
        window.location.reload();
    }
}

function pushNotification() {
    stocks.forEach(s => { s.targetNotified = false; s.stopNotified = false; });
    fetchAllLTPs();
    alert("Alerts reset. You will be notified when targets are hit.");
}

// Start sequence
displayStocks();
fetchAllLTPs();
setInterval(fetchAllLTPs, 30000); // 30 seconds interval to respect Render's free tier