import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMr6_gJxdtCEl_uYmsDN9LwXtq9rRoWRA",
  authDomain: "kids-room-app.firebaseapp.com",
  projectId: "kids-room-app",
  storageBucket: "kids-room-app.firebasestorage.app",
  messagingSenderId: "150998614419",
  appId: "1:150998614419:web:3e1c21633155871f666866"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const BASE_URL = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
let currentData = null;

// --- ТАРИФЫ И ЛОГИКА РАСЧЕТА ---
const PRICE_30 = 300;
const PRICE_1H = 400;
const PRICE_UNLIM = 600;

function calcActualPrice(minutes) {
    if (minutes < 15) return 0;
    if (minutes < 45) return PRICE_30;
    if (minutes < 75) return PRICE_1H;
    return PRICE_UNLIM;
}

function applyDiscount(baseSum, category) {
    if (category === 'yarmarka') return Math.round(baseSum * 0.5);
    if (category === 'fitness') return Math.round(baseSum * 0.9);
    if (category === 'svo' || category === 'ovz' || category === 'many') {
        return Math.max(0, baseSum - 50);
    }
    return baseSum;
}

function getPrepaidAmount(tariffHours) {
    if (tariffHours === 0.5) return PRICE_30;
    if (tariffHours === 1) return PRICE_1H;
    if (tariffHours >= 24) return PRICE_UNLIM;
    return PRICE_30;
}

function categoryLabel(cat) {
    const map = {
        'standard': 'Стандарт',
        'yarmarka': 'Сотрудник ТЦ «Ярмарка»',
        'fitness': 'Фитнес-клуб',
        'svo': 'СВО',
        'ovz': 'ОВЗ',
        'many': 'Многодетные'
    };
    return map[cat] || 'Стандарт';
}

function getCurrentMinutes(checkInTime) {
    if (!checkInTime) return 0;
    const start = checkInTime.toDate ? checkInTime.toDate() : new Date(checkInTime);
    return Math.floor((new Date() - start) / 60000);
}

// --- РОДИТЕЛЬ: форма заявки ---
const form = document.getElementById('visitForm');
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('childName').value;
        const phone = document.getElementById('parentPhone').value;
        const tariffHours = Number(document.getElementById('tariff').value);
        const category = document.getElementById('category').value;

        const prepaidBase = getPrepaidAmount(tariffHours);
        const prepaid = applyDiscount(prepaidBase, category);

        try {
            await addDoc(collection(db, "visits"), {
                childName: name,
                parentPhone: phone,
                tariffHours: tariffHours,
                category: category,
                prepaid: prepaid,
                status: "pending",
                checkInTime: null,
                checkOutTime: null,
                createdAt: serverTimestamp()
            });
            document.getElementById('status').innerText = `Заявка отправлена! К оплате при заезде: ${prepaid} ₽`;
            form.reset();
        } catch (error) {
            console.error("Ошибка: ", error);
            document.getElementById('status').innerText = "Ошибка отправки.";
        }
    });
}

// --- РОДИТЕЛЬ: страница статуса ---
const timerElement = document.getElementById('timer');
if (timerElement) {
    const urlParams = new URLSearchParams(window.location.search);
    const visitId = urlParams.get('id');
    let timerInterval = null;
    let alarmTriggered = false;

    if (!visitId) {
        document.getElementById('mainCard').innerHTML = "<h2>Ошибка: Запись не найдена</h2>";
    } else {
        onSnapshot(doc(db, "visits", visitId), (docSnap) => {
            if (!docSnap.exists()) return;
            currentData = docSnap.data();
            
            document.getElementById('childName').innerText = currentData.childName;

            if (currentData.status === 'completed' && currentData.checkOutTime) {
                const end = currentData.checkOutTime.toDate();
                document.getElementById('timer').innerText = end.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
                document.getElementById('timer').style.color = '#27ae60';
                document.getElementById('timeLeftText').innerText = "Ребенка забрали";
                document.getElementById('extendBtn').style.display = 'none';
                if (timerInterval) clearInterval(timerInterval);
                if (currentData.actualPrice !== undefined) {
                    const diff = currentData.prepaid - currentData.actualPrice;
                    if (diff > 0) {
                        document.getElementById('price').innerText = `${currentData.actualPrice} ₽ (возврат ${diff} ₽)`;
                    } else if (diff < 0) {
                        document.getElementById('price').innerText = `${currentData.actualPrice} ₽ (доплата ${-diff} ₽)`;
                    } else {
                        document.getElementById('price').innerText = `${currentData.actualPrice} ₽`;
                    }
                }
                return;
            }

            if (currentData.checkInTime) {
                const start = currentData.checkInTime.toDate();
                const limitHours = currentData.tariffHours >= 24 ? 24 : currentData.tariffHours;
                const end = new Date(start.getTime() + limitHours * 60 * 60 * 1000);
                
                document.getElementById('startTime').innerText = start.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                document.getElementById('endTime').innerText = limitHours >= 24 ? 'Безлимит (24 ч)' : end.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
                document.getElementById('price').innerText = currentData.prepaid;
                document.getElementById('tariffText').innerText = `${categoryLabel(currentData.category)} | Тариф: ${limitHours >= 24 ? 'Безлимит' : limitHours + ' ч.'}`;

                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    const diff = end - new Date();
                    if (diff <= 0) {
                        timerElement.innerText = "00:00:00";
                        timerElement.style.color = "red";
                        document.getElementById('timeLeftText').innerText = "Время вышло!";
                        clearInterval(timerInterval);
                        if (!alarmTriggered) {
                            alarmTriggered = true;
                            if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
                            const audio = document.getElementById('alarmSound');
                            if (audio) audio.play().catch(e => console.log("Звук заблокирован:", e));
                        }
                    } else {
                        const h = Math.floor(diff / 3600000);
                        const m = Math.floor((diff % 3600000) / 60000);
                        const s = Math.floor((diff % 60000) / 1000);
                        timerElement.innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                        document.getElementById('timeLeftText').innerText = `${h} ч. ${m} мин.`;
                    }
                }, 1000);
            } else {
                document.getElementById('mainCard').innerHTML = "<h2>Ожидайте подтверждения администратора...</h2>";
            }
        });
    }
}

window.extendTime = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const visitId = urlParams.get('id');
    if (visitId && currentData) {
        let newTariff = currentData.tariffHours;
        if (currentData.tariffHours === 0.5) newTariff = 1;
        else if (currentData.tariffHours === 1) newTariff = 24;
        else newTariff = 24;

        const base = getPrepaidAmount(newTariff);
        const newPrepaid = applyDiscount(base, currentData.category);

        await updateDoc(doc(db, "visits", visitId), {
            tariffHours: newTariff,
            prepaid: newPrepaid
        });
        document.getElementById('msg').innerText = "Тариф повышен!";
        document.getElementById('msg').style.display = 'block';
        setTimeout(() => document.getElementById('msg').style.display = 'none', 3000);
    }
};

// --- АДМИН ---
if (window.location.pathname.includes('admin.html')) {
    let activeSort = { column: 'start', asc: true };
    let rawActiveData = [];
    let intervalId = null;
    let pendingCheckoutId = null;

    window.login = () => {
        const email = document.getElementById('adminEmail').value;
        const pass = document.getElementById('adminPass').value;
        if (!email || !pass) { alert("Введите email и пароль"); return; }
        signInWithEmailAndPassword(auth, email, pass)
            .catch((error) => alert("Ошибка входа: " + error.message));
    };

    window.logout = () => {
        signOut(auth).catch((error) => alert("Ошибка выхода: " + error.message));
    };

    onAuthStateChanged(auth, (user) => {
        if (user) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            document.getElementById('logoutBtn').style.display = 'block';
            startListening();
        } else {
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('adminPanel').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'none';
            if (intervalId) clearInterval(intervalId);
        }
    });

    function startListening() {
        const pendingContainer = document.getElementById('pendingContainer');
        const activeContainer = document.getElementById('activeContainer');
        const debug = document.getElementById('debug');

        onSnapshot(collection(db, "visits"), (snapshot) => {
            let pendingHTML = `<table><tr><th class="no-sort">Имя</th><th class="no-sort">Телефон</th><th class="no-sort">Тариф</th><th class="no-sort">Категория</th><th class="no-sort">Предоплата</th><th class="no-sort">Действие</th></tr>`;
            rawActiveData = [];
            let pendingCount = 0;
            let activeCount = 0;

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const id = docSnap.id;

                if (data.status === 'pending') {
                    pendingCount++;
                    pendingHTML += `<tr>
                        <td>${data.childName}</td>
                        <td>${data.parentPhone}</td>
                        <td>${data.tariffHours >= 24 ? 'Безлимит' : data.tariffHours + ' ч.'}</td>
                        <td>${categoryLabel(data.category)}</td>
                        <td class="col-money">${data.prepaid} ₽</td>
                        <td><button class="btn btn-approve" onclick="approveVisit('${id}')">Посадить</button></td>
                    </tr>`;
                } else if (data.status === 'active') {
                    activeCount++;
                    rawActiveData.push({ id, ...data });
                }
            });

            pendingHTML += `</table>`;
            pendingContainer.innerHTML = pendingHTML;
            
            renderActiveTable(activeContainer);
            debug.innerText = `Всего: Pending: ${pendingCount}, Active: ${activeCount}`;
        }, (error) => {
            console.error("Ошибка onSnapshot:", error);
        });

        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(() => {
            if (rawActiveData.length > 0) {
                renderActiveTable(document.getElementById('activeContainer'));
            }
        }, 60000);
    }

    function renderActiveTable(container) {
        rawActiveData.sort((a, b) => {
            let valA, valB;
            if (activeSort.column === 'start') {
                valA = a.checkInTime ? a.checkInTime.toDate().getTime() : 0;
                valB = b.checkInTime ? b.checkInTime.toDate().getTime() : 0;
            } else if (activeSort.column === 'name') {
                valA = a.childName.toLowerCase();
                valB = b.childName.toLowerCase();
            } else if (activeSort.column === 'tariff') {
                valA = a.tariffHours;
                valB = b.tariffHours;
            } else {
                valA = 0; valB = 0;
            }
            if (valA < valB) return activeSort.asc ? -1 : 1;
            if (valA > valB) return activeSort.asc ? 1 : -1;
            return 0;
        });

        let activeHTML = `<table>
            <tr>
                <th onclick="sortActive('name')">Имя ${activeSort.column==='name' ? (activeSort.asc?'▲':'▼') : ''}</th>
                <th onclick="sortActive('start')">Прибыл ${activeSort.column==='start' ? (activeSort.asc?'▲':'▼') : ''}</th>
                <th class="no-sort">Уход</th>
                <th onclick="sortActive('tariff')">Тариф ${activeSort.column==='tariff' ? (activeSort.asc?'▲':'▼') : ''}</th>
                <th class="no-sort">Категория</th>
                <th class="no-sort">Предоплата</th>
                <th class="no-sort">Факт (сейчас)</th>
                <th class="no-sort">Возврат / Доплата</th>
                <th class="no-sort">Связь</th>
                <th class="no-sort">QR</th>
                <th class="no-sort">Действие</th>
            </tr>`;

        rawActiveData.forEach(data => {
            const id = data.id;
            const start = data.checkInTime ? data.checkInTime.toDate() : new Date();
            const limitHours = data.tariffHours >= 24 ? 24 : data.tariffHours;
            const end = new Date(start.getTime() + limitHours * 60 * 60 * 1000);
            const startStr = start.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
            const endStr = limitHours >= 24 ? 'Безлимит' : end.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});

            const currentMinutes = getCurrentMinutes(data.checkInTime);
            const baseActualNow = calcActualPrice(currentMinutes);
            const actualNow = applyDiscount(baseActualNow, data.category);
            const prepaid = data.prepaid || 0;
            const diff = prepaid - actualNow;
            
            let diffStr = '';
            if (diff > 0) diffStr = `<span style="color:green; font-weight:bold;">+${diff} ₽</span>`;
            else if (diff < 0) diffStr = `<span style="color:red; font-weight:bold;">${diff} ₽</span>`;
            else diffStr = `0 ₽`;

            activeHTML += `<tr>
                <td>${data.childName}</td>
                <td>${startStr}</td>
                <td>${endStr}</td>
                <td>${data.tariffHours >= 24 ? 'Безлимит' : data.tariffHours + ' ч.'}</td>
                <td>${categoryLabel(data.category)}</td>
                <td class="col-money">${prepaid} ₽</td>
                <td class="col-money">${actualNow} ₽ <br><small style="color:#777">(${currentMinutes} мин)</small></td>
                <td class="col-money">${diffStr}</td>
                <td><a href="tel:${data.parentPhone}" class="btn btn-call">📞</a></td>
                <td><button class="btn btn-qr" onclick="showQR('${id}', '${data.childName}')">QR</button></td>
                <td>
                    <button class="btn btn-checkout" onclick="openCalcModal('${id}')">Забрали</button>
                </td>
            </tr>`;
        });

        activeHTML += `</table>`;
        container.innerHTML = activeHTML;
    }

    window.sortActive = (column) => {
        if (activeSort.column === column) {
            activeSort.asc = !activeSort.asc;
        } else {
            activeSort.column = column;
            activeSort.asc = true;
        }
        renderActiveTable(document.getElementById('activeContainer'));
    };

    window.openCalcModal = (id) => {
        const data = rawActiveData.find(d => d.id === id);
        if (!data) return;
        pendingCheckoutId = id;

        const start = data.checkInTime.toDate();
        const end = new Date();
        const minutes = Math.floor((end - start) / 60000);
        const baseActual = calcActualPrice(minutes);
        const actualPrice = applyDiscount(baseActual, data.category);
        const prepaid = data.prepaid || 0;
        const diff = prepaid - actualPrice;

        let tariffName = 'Безлимит (600 ₽)';
        if (minutes < 15) tariffName = 'Бесплатно (<15 мин)';
        else if (minutes < 45) tariffName = '30 минут (300 ₽)';
        else if (minutes < 75) tariffName = '1 час (400 ₽)';

        let diffStr = '';
        if (diff > 0) diffStr = `<span style="color:green;">Вернуть ${diff} ₽</span>`;
        else if (diff < 0) diffStr = `<span style="color:red;">Доплатить ${-diff} ₽</span>`;
        else diffStr = `0 ₽`;

        document.getElementById('calcDetails').innerHTML = `
            <p><span>Имя ребенка:</span> <span>${data.childName}</span></p>
            <p><span>Время в комнате:</span> <span>${minutes} мин.</span></p>
            <p><span>Тариф по факту:</span> <span>${tariffName}</span></p>
            <p><span>Предоплата:</span> <span>${prepaid} ₽</span></p>
            <p class="total-line"><span>Итоговый расчет:</span> <span>${diffStr}</span></p>
        `;
        document.getElementById('calcModal').style.display = 'flex';
    };

    window.confirmCheckout = async () => {
        if (!pendingCheckoutId) return;
        const id = pendingCheckoutId;
        const data = rawActiveData.find(d => d.id === id);
        if (!data) return;

        const start = data.checkInTime.toDate();
        const end = new Date();
        const minutes = Math.floor((end - start) / 60000);
        const baseActual = calcActualPrice(minutes);
        const actualPrice = applyDiscount(baseActual, data.category);

        await updateDoc(doc(db, "visits", id), {
            status: "completed",
            checkOutTime: end,
            actualMinutes: minutes,
            actualPrice: actualPrice
        });

        document.getElementById('calcModal').style.display = 'none';
        pendingCheckoutId = null;
    };

    window.showQR = (id, name) => {
        document.getElementById('modalChildName').innerText = name;
        const qrContainer = document.getElementById('qrModalCanvas');
        qrContainer.innerHTML = '';
        const parentLink = `${BASE_URL}status.html?id=${id}`;
        new QRCode(qrContainer, { text: parentLink, width: 400, height: 400, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
        document.getElementById('qrModal').style.display = 'flex';
    };

    window.closeModal = () => {
        document.getElementById('qrModal').style.display = 'none';
    };

    window.approveVisit = async (id) => {
        await updateDoc(doc(db, "visits", id), {
            status: "active",
            checkInTime: new Date(),
            adminEmail: auth.currentUser ? auth.currentUser.email : "unknown"
        });
    };
}
// --- СУПЕРПОЛЬЗОВАТЕЛЬ ---
if (window.location.pathname.includes('superuser.html')) {
    let allCompleted = [];
    let filteredData = [];
    let hoursChartInstance = null;
    let currentFilter = { from: null, to: null };

    window.login = () => {
        const email = document.getElementById('adminEmail').value;
        const pass = document.getElementById('adminPass').value;
        if (!email || !pass) { alert("Введите email и пароль"); return; }
        signInWithEmailAndPassword(auth, email, pass)
            .catch((error) => alert("Ошибка входа: " + error.message));
    };

    window.logout = () => {
        signOut(auth).catch((error) => alert("Ошибка выхода: " + error.message));
    };

    onAuthStateChanged(auth, (user) => {
        if (user) {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('superPanel').style.display = 'block';
            document.getElementById('logoutBtn').style.display = 'block';
            loadSuperData();
        } else {
            document.getElementById('loginSection').style.display = 'block';
            document.getElementById('superPanel').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'none';
        }
    });

    function loadSuperData() {
        onSnapshot(collection(db, "visits"), (snapshot) => {
            allCompleted = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.status === 'completed') {
                    allCompleted.push({ id: docSnap.id, ...data });
                }
            });
            applyDateFilter(true);
        });
    }

    window.applyDateFilter = (silent = false) => {
        const fromVal = document.getElementById('filterFrom').value;
        const toVal = document.getElementById('filterTo').value;
        currentFilter.from = fromVal ? new Date(fromVal + 'T00:00:00') : null;
        currentFilter.to = toVal ? new Date(toVal + 'T23:59:59') : null;

        filteredData = allCompleted.filter(d => {
            if (!d.checkInTime) return false;
            const dt = d.checkInTime.toDate();
            if (currentFilter.from && dt < currentFilter.from) return false;
            if (currentFilter.to && dt > currentFilter.to) return false;
            return true;
        });
        renderAll();
        if (!silent) { document.getElementById('filterFrom').blur(); document.getElementById('filterTo').blur(); }
    };

    window.resetDateFilter = () => {
        document.getElementById('filterFrom').value = '';
        document.getElementById('filterTo').value = '';
        applyDateFilter(true);
    };

    function renderAll() {
        renderTotalStats();
        renderDailyTable();
        renderHistory(filteredData);
        renderHoursChart();
    }

    function renderTotalStats() {
        let totalChildren = filteredData.length;
        let totalHours = 0;
        let totalRevenue = 0;
        filteredData.forEach(d => {
            if (d.actualMinutes) totalHours += d.actualMinutes / 60;
            totalRevenue += (d.actualPrice || 0);
        });
        document.getElementById('totalChildren').innerText = totalChildren;
        document.getElementById('totalHours').innerText = totalHours.toFixed(1) + " ч.";
        document.getElementById('totalRevenue').innerText = totalRevenue + " ₽";
    }

    function renderDailyTable() {
        const daily = {};
        filteredData.forEach(d => {
            let dateKey = "Неизвестно";
            if (d.checkInTime) {
                dateKey = d.checkInTime.toDate().toLocaleDateString('ru-RU');
            }
            if (!daily[dateKey]) daily[dateKey] = { count: 0, hours: 0, revenue: 0, admins: new Set() };
            daily[dateKey].count++;
            if (d.actualMinutes) daily[dateKey].hours += d.actualMinutes / 60;
            daily[dateKey].revenue += (d.actualPrice || 0);
            if (d.adminEmail) daily[dateKey].admins.add(d.adminEmail);
        });

        const tbody = document.getElementById('dailyTable');
        tbody.innerHTML = '';
        const sortedKeys = Object.keys(daily).sort((a, b) => {
            if (a === "Неизвестно") return 1;
            if (b === "Неизвестно") return -1;
            const [da, ma, ya] = a.split('.');
            const [db, mb, yb] = b.split('.');
            return new Date(ya, ma-1, da) - new Date(yb, mb-1, db);
        });

        sortedKeys.forEach(date => {
            const row = daily[date];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${date}</td>
                <td>${row.count}</td>
                <td>${row.hours.toFixed(1)}</td>
                <td>${row.revenue}</td>
                <td>${row.admins.size ? Array.from(row.admins).join(', ') : '—'}</td>
                <td><button class="btn-delete" onclick="deleteDay('${date}')">🗑️</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderHistory(data) {
        const tbody = document.getElementById('historyTable');
        tbody.innerHTML = '';
        data.sort((a, b) => {
            const ta = a.checkInTime ? a.checkInTime.toDate().getTime() : 0;
            const tb = b.checkInTime ? b.checkInTime.toDate().getTime() : 0;
            return tb - ta;
        });
        data.forEach(d => {
            const start = d.checkInTime ? d.checkInTime.toDate() : null;
            const end = d.checkOutTime ? d.checkOutTime.toDate() : null;
            const actual = d.actualPrice !== undefined ? d.actualPrice : (d.prepaid || 0);
            const prepaid = d.prepaid || 0;
            const diff = prepaid - actual;
            let diffText = '';
            if (diff > 0) diffText = `<span style="color:green;">возврат ${diff} ₽</span>`;
            else if (diff < 0) diffText = `<span style="color:red;">доплата ${-diff} ₽</span>`;
            else diffText = '—';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${start ? start.toLocaleDateString('ru-RU') : '—'}</td>
                <td>${d.childName}</td>
                <td>${start ? start.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) : '—'}</td>
                <td>${end ? end.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) : '—'}</td>
                <td>${d.actualMinutes ? d.actualMinutes + ' мин.' : '—'}</td>
                <td>${categoryLabel(d.category)}</td>
                <td>${prepaid} ₽</td>
                <td>${actual} ₽</td>
                <td>${diffText}</td>
                <td>${d.adminEmail || '—'}</td>
                <td><button class="btn-delete" onclick="deleteOne('${d.id}')">🗑️</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.deleteOne = async (id) => {
        if (!confirm("Удалить эту запись навсегда?")) return;
        try { await deleteDoc(doc(db, "visits", id)); } catch (e) { alert("Ошибка удаления: " + e.message); }
    };

    window.deleteDay = async (dateStr) => {
        if (dateStr === "Неизвестно") { alert("Нельзя удалить записи без даты."); return; }
        const ids = allCompleted.filter(d => d.checkInTime && d.checkInTime.toDate().toLocaleDateString('ru-RU') === dateStr).map(d => d.id);
        if (ids.length === 0) { alert("Нет записей за эту дату."); return; }
        if (!confirm(`Удалить ${ids.length} записей за ${dateStr}?`)) return;
        try { for (const id of ids) await deleteDoc(doc(db, "visits", id)); } catch (e) { alert("Ошибка: " + e.message); }
    };

    window.deleteFilteredDay = async () => {
        const fromVal = document.getElementById('filterFrom').value;
        const toVal = document.getElementById('filterTo').value;

        if (!fromVal && !toVal) {
            alert("Укажите дату (поле «с» и/или «по»), чтобы удалить записи за день.");
            return;
        }
        if (fromVal !== toVal && toVal !== '') {
            alert("Для удаления за день укажите одну и ту же дату в полях «с» и «по».");
            return;
        }

        const dayStr = fromVal || toVal;
        const [y, m, d] = dayStr.split('-');
        const dateStr = `${d}.${m}.${y}`;
        await deleteDay(dateStr);
    };

    function renderHoursChart() {
        const hoursCount = Array(24).fill(0);
        filteredData.forEach(d => {
            if (!d.checkInTime || !d.checkOutTime) return;
            const start = d.checkInTime.toDate();
            const end = d.checkOutTime.toDate();
            if (end <= start) return;
            
            const startHour = start.getHours();
            const endHour = end.getHours();
            
            for (let h = startHour; h <= endHour; h++) {
                const hourStart = new Date(start);
                hourStart.setHours(h, 0, 0, 0);
                const hourEnd = new Date(start);
                hourEnd.setHours(h + 1, 0, 0, 0);
                
                if (start < hourEnd && end > hourStart) {
                    hoursCount[h]++;
                }
            }
        });

        const ctx = document.getElementById('hoursChart').getContext('2d');
        if (hoursChartInstance) hoursChartInstance.destroy();
        hoursChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Array.from({length: 24}, (_, i) => i + ':00'),
                datasets: [{
                    label: 'Детей в комнате',
                    data: hoursCount,
                    backgroundColor: 'rgba(52, 152, 219, 0.7)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }
}
