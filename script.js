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

    stocks.forEach((stock, i) => {
        const row = document.createElement("tr");
        row.setAttribute("data-index", i);
        row.innerHTML = `
            <td>${stock.name}</td>
            <td contenteditable="true" oninput="updateStock(${i}, 'quantity', this.textContent)">${stock.quantity}</td>
            <td contenteditable="true" oninput="updateStock(${i}, 'wacc', this.textContent)">${stock.wacc}</td>
            <td class="ltp-cell">${stock.ltp}</td>
            <td class="amount-cell">${(stock.ltp * stock.quantity).toFixed(2)}</td>
            <td class="pl-cell ${(stock.ltp - stock.wacc) * stock.quantity >= 0 ? 'profit' : 'loss'}">${((stock.ltp - stock.wacc) * stock.quantity).toFixed(2)}</td>
            <td class="pl-percent-cell ${(stock.ltp - stock.wacc) * stock.quantity >= 0 ? 'profit' : 'loss'}">${stock.wacc > 0 ? (((stock.ltp - stock.wacc)/stock.wacc)*100).toFixed(2) : 0}%</td>
            <td><button class="delete-btn" onclick="deleteStock(${i})">Delete</button></td>
        `;
        stockList.appendChild(row);
    });

    updateSummary();
}

function updateSummary() {
    let currentValue = 0, totalPL = 0, currentInvestment = 0, totalProfitLoss = 0;
    stocks.forEach(stock => {
        const amount = stock.ltp * stock.quantity;
        const profitLoss = (stock.ltp - stock.wacc) * stock.quantity;
        const investment = stock.wacc * stock.quantity;

        currentValue += amount;
        totalPL += profitLoss;
        currentInvestment += investment;
        totalProfitLoss += profitLoss;
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
    updateRow(i);
}

function deleteStock(i) {
    stocks.splice(i, 1);
    displayStocks();
}

// 🔹 Only update LTP cells without replacing table
async function fetchAllLTPs() {
    if (!stocks.length) return;
    const symbols = stocks.map(s => s.name).join(",");
    try {
        const resp = await fetch(`${BACKEND_URL}/api/ltp-multi?symbols=${symbols}`);
        if (!resp.ok) throw new Error("Network response not ok");
        const data = await resp.json();

        data.forEach(item => {
            const index = stocks.findIndex(s => s.name === item.symbol);
            if (index !== -1) {
                stocks[index].ltp = parseFloat(item.ltp ?? 0);
                updateRow(index); // update only this row
            }
        });
        updateSummary();
        saveStocks();
    } catch (err) {
        console.error("Error fetching LTPs", err);
    }
}

// 🔹 Update only a single row (non-destructive)
function updateRow(i) {
    const row = document.querySelector(`tr[data-index="${i}"]`);
    if (!row) return;

    const stock = stocks[i];
    row.querySelector(".ltp-cell").textContent = stock.ltp;
    row.querySelector(".amount-cell").textContent = (stock.ltp * stock.quantity).toFixed(2);
    const profitLoss = (stock.ltp - stock.wacc) * stock.quantity;
    row.querySelector(".pl-cell").textContent = profitLoss.toFixed(2);
    row.querySelector(".pl-cell").className = `pl-cell ${profitLoss >= 0 ? 'profit' : 'loss'}`;
    const plPercent = stock.wacc > 0 ? ((stock.ltp - stock.wacc)/stock.wacc)*100 : 0;
    row.querySelector(".pl-percent-cell").textContent = plPercent.toFixed(2) + "%";
    row.querySelector(".pl-percent-cell").className = `pl-percent-cell ${profitLoss >= 0 ? 'profit' : 'loss'}`;
}

// 🔹 Refresh every 5 seconds
setInterval(fetchAllLTPs, 5000);

// 🔹 Initial display
displayStocks();
fetchAllLTPs();
