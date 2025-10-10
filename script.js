// Request permission for desktop notifications
if (Notification.permission !== "granted") {
    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            console.log("✅ Notification permission granted.");
        } else {
            console.log("❌ Notification permission denied.");
        }
    });
}
let stocks = JSON.parse(localStorage.getItem('stocks')) || [];
const BACKEND_URL = "https://nepse-live-backend-1.onrender.com";

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

    stocks.push({ name, quantity, wacc, target: 0, stopLoss: 0, ltp: 0 });
    clearInputs();
    displayStocks();
    saveStocks();
}

function clearInputs() {
    document.getElementById("stockName").value = "";
    document.getElementById("quantity").value = "";
    document.getElementById("wacc").value = "";
}

function displayStocks() {
    const stockList = document.getElementById("stockList");
    stockList.innerHTML = "";

    let currentValue = 0, totalPL = 0, currentInvestment = 0, totalProfitLoss = 0;

    stocks.forEach((stock, i) => {
        const amount = stock.ltp * stock.quantity;
        const profitLoss = (stock.ltp - stock.wacc) * stock.quantity;
        const plPercent = stock.wacc > 0 ? ((stock.ltp - stock.wacc) / stock.wacc) * 100 : 0;
        const investment = stock.wacc * stock.quantity;

        currentValue += amount; totalPL += profitLoss; currentInvestment += investment; totalProfitLoss += profitLoss;

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${stock.name}</td>
            <td contenteditable="true" oninput="updateStock(${i}, 'quantity', this.textContent)">${stock.quantity}</td>
            <td contenteditable="true" oninput="updateStock(${i}, 'wacc', this.textContent)">${stock.wacc}</td>
            <td contenteditable="true" oninput="updateStock(${i}, 'target', this.textContent)">${stock.target || 0}</td>
            <td contenteditable="true" oninput="updateStock(${i}, 'stopLoss', this.textContent)">${stock.stopLoss || 0}</td>
            <td>${stock.ltp.toFixed(2)}</td>
            <td>${amount.toFixed(2)}</td>
            <td class="${profitLoss >= 0 ? 'profit' : 'loss'}">${profitLoss.toFixed(2)}</td>
            <td class="${profitLoss >= 0 ? 'profit' : 'loss'}">${plPercent.toFixed(2)}%</td>
            <td><button class="delete-btn" onclick="deleteStock(${i})">Delete</button></td>
        `;

        stockList.appendChild(row);
    });

    document.getElementById("currentValue").textContent = currentValue.toFixed(2);
    document.getElementById("totalPL").textContent = totalPL.toFixed(2);
    document.getElementById("currentInvestment").textContent = currentInvestment.toFixed(2);
    document.getElementById("totalProfitLoss").textContent = totalProfitLoss.toFixed(2);
}

function updateStock(i, field, value) {
    const val = parseFloat(value);
    if (isNaN(val) || val < 0) return;
    stocks[i][field] = val;
    displayStocks();
}

function deleteStock(i) {
    stocks.splice(i, 1);
    displayStocks();
}

function sortStocks(field) {
    if (field === 'name') stocks.sort((a, b) => a.name.localeCompare(b.name));
    else if (field === 'profitLoss') stocks.sort((a, b) => ((b.ltp - b.wacc) * b.quantity) - ((a.ltp - a.wacc) * a.quantity));
    displayStocks();
}

// --- LTP Handling ---

// Update only the LTP column and dependent columns for one row
function updateLTPCell(index, ltp) {
    const stockList = document.getElementById("stockList");
    const row = stockList.children[index];
    if (!row) return;

    row.cells[3].textContent = ltp.toFixed(2);

    const quantity = parseFloat(row.cells[1].textContent);
    const wacc = parseFloat(row.cells[2].textContent);
    const amount = ltp * quantity;
    const profitLoss = (ltp - wacc) * quantity;
    const plPercent = wacc > 0 ? ((ltp - wacc) / wacc) * 100 : 0;

    row.cells[4].textContent = amount.toFixed(2);
    row.cells[5].textContent = profitLoss.toFixed(2);
    row.cells[5].className = profitLoss >= 0 ? 'profit' : 'loss';
    row.cells[6].textContent = plPercent.toFixed(2) + "%";
    row.cells[6].className = profitLoss >= 0 ? 'profit' : 'loss';
}

// Fetch LTP for all stocks from backend
async function fetchAllLTPs() {
    if (!stocks.length) return;

    for (let i = 0; i < stocks.length; i++) {
        const symbol = stocks[i].name;
        try {
            const resp = await fetch(`${BACKEND_URL}/api/ltp?symbol=${symbol}`);
            if (!resp.ok) continue;
            const data = await resp.json();
            const ltp = Number(data.ltp) || 0;
            stocks[i].ltp = ltp;
            updateLTPCell(i, ltp);

            // === Check for notifications ===
            const target = parseFloat(stocks[i].target);
            const stopLoss = parseFloat(stocks[i].stopLoss);
            if (!isNaN(target) && ltp >= target && !stocks[i].targetNotified) {
                showNotification(`🎯 ${symbol}`, `Target reached at Rs. ${ltp}`);
                stocks[i].targetNotified = true;
                stocks[i].stopNotified = false;
            }   
            if (!isNaN(stopLoss) && ltp <= stopLoss && !stocks[i].stopNotified) {
                showNotification(`⚠️ ${symbol}`, `Stop loss triggered at Rs. ${ltp}`);
                stocks[i].stopNotified = true;
                stocks[i].targetNotified = false;
            } 
        } catch (err) {
            console.error("Error fetching LTP for", symbol, err);
        }
    }

    saveStocks();
}

// Initial display
displayStocks();
// Fetch LTP every 10 seconds
setInterval(fetchAllLTPs, 10000);
