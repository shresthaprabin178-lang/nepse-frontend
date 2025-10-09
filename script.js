let stocks = JSON.parse(localStorage.getItem('stocks')) || [];
const BACKEND_URL = "https://nepse-live-backend-1.onrender.com";

function saveStocks() {
    localStorage.setItem('stocks', JSON.stringify(stocks));
}

function addStock() {
    let name = document.getElementById("stockName").value.toUpperCase().trim();
    const quantity = parseFloat(document.getElementById("quantity").value);
    const wacc = parseFloat(document.getElementById("wacc").value);

    if (!name || isNaN(quantity) || quantity <= 0 || isNaN(wacc) || wacc <= 0) {
        alert("Enter valid symbol, quantity & WACC");
        return;
    }

    stocks.push({ name, quantity, wacc, ltp: 0 });
    clearInputs();
    saveStocks();
    displayStocks();
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
            <td>${stock.ltp}</td>
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

    saveStocks();
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

// Fetch live LTP from backend
async function fetchLiveLTP() {
    for (let stock of stocks) {
        try {
            const resp = await fetch(`${BACKEND_URL}/api/ltp?symbol=${stock.name}`);
            if (!resp.ok) continue;
            const data = await resp.json();
            stock.ltp = parseFloat(data.ltp) || 0;
        } catch (err) {
            console.error("Error fetching LTP for", stock.name, err);
        }
    }
    displayStocks();
}

// Update every 5 sec
setInterval(fetchLiveLTP, 5000);

displayStocks();
